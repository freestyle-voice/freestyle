import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  editAgentFile,
  globAgentFiles,
  grepAgentFiles,
  readAgentFile,
  resolveAgentPath,
  runAgentBash,
  writeAgentFile,
} from "../src/lib/agent-os.js";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "agent-os-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("path resolution", () => {
  it("resolves native absolute paths and relative paths against home", () => {
    const absolutePath = path.resolve(
      process.platform === "win32" ? "C:\\etc\\hosts" : "/etc/hosts",
    );
    expect(resolveAgentPath(absolutePath).full).toBe(absolutePath);
    expect(resolveAgentPath("Documents/x.txt").full).toBe(
      path.join(homedir(), "Documents", "x.txt"),
    );
  });

  it("expands a leading tilde into the user's home directory", () => {
    expect(resolveAgentPath("~/Documents/agent-notes.md").full).toBe(
      path.join(homedir(), "Documents", "agent-notes.md"),
    );
  });
});

describe("file ops", () => {
  it("write/read/edit on absolute paths", () => {
    const target = path.join(workDir, "nested", "doc.txt");
    writeAgentFile(target, "hello world\nsecond line\n");
    expect(readAgentFile(target).text).toContain("hello world");
    expect(readAgentFile(target, 2, 1).text).toBe("second line");
    expect(editAgentFile(target, "hello", "goodbye")).toBe("ok");
    expect(readFileSync(target, "utf8")).toContain("goodbye world");
    expect(editAgentFile(target, "absent", "x")).toBe("not-found");
    expect(editAgentFile(target, "goodbye", "$$ $& costs $'5")).toBe("ok");
    expect(readFileSync(target, "utf8")).toContain("$$ $& costs $'5 world");
  });

  it("glob and grep under an absolute root", () => {
    writeAgentFile(path.join(workDir, "a.md"), "Genmaicha tea");
    writeAgentFile(path.join(workDir, "deep", "b.md"), "plain");
    const paths = globAgentFiles("**/*.md", workDir).map((f) => f.path);
    expect(paths).toContain("a.md");
    expect(paths).toContain("deep/b.md");
    expect(grepAgentFiles("genmai.*tea", workDir)[0]?.path).toBe("a.md");
  });
});

describe("bash", () => {
  it("uses a non-interactive PowerShell command on Windows", async () => {
    const powershell = vi.fn(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => callback(null, "C:\\Users\\Freestyle", ""),
    );

    const res = await runAgentBash("Get-Location", {
      platform: "win32",
      execFile: powershell,
    } as never);

    expect(powershell).toHaveBeenCalledWith(
      "pwsh.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        expect.stringContaining("Get-Location"),
      ],
      expect.objectContaining({ cwd: homedir(), timeout: 30_000 }),
      expect.any(Function),
    );
    expect(res).toMatchObject({
      ok: true,
      category: "success",
      exitCode: 0,
    });
  });

  it("normalizes a missing Windows shell into a stable category", async () => {
    const unavailable = Object.assign(new Error("not found"), {
      code: "ENOENT",
    });
    const powershell = vi.fn(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error, stdout: string, stderr: string) => void,
      ) => callback(unavailable, "", ""),
    );

    const res = await runAgentBash("Get-Location", {
      platform: "win32",
      execFile: powershell,
    } as never);

    expect(res).toMatchObject({
      ok: false,
      category: "shell-unavailable",
      reason: "shell-unavailable",
      exitCode: 1,
    });
    expect(powershell).toHaveBeenCalledTimes(2);
  });

  it("falls back to Windows PowerShell when pwsh is unavailable", async () => {
    const unavailable = Object.assign(new Error("not found"), {
      code: "ENOENT",
    });
    const powershell = vi
      .fn()
      .mockImplementationOnce(
        (
          _file: string,
          _args: string[],
          _options: unknown,
          callback: (error: Error, stdout: string, stderr: string) => void,
        ) => callback(unavailable, "", ""),
      )
      .mockImplementationOnce(
        (
          _file: string,
          _args: string[],
          _options: unknown,
          callback: (
            error: Error | null,
            stdout: string,
            stderr: string,
          ) => void,
        ) => callback(null, "fallback output", ""),
      );

    const res = await runAgentBash("Get-Location", {
      platform: "win32",
      execFile: powershell,
    } as never);

    expect(powershell.mock.calls.map(([file]) => file)).toEqual([
      "pwsh.exe",
      "powershell.exe",
    ]);
    expect(res).toMatchObject({
      ok: true,
      category: "success",
      stdout: "fallback output",
    });
  });

  it("runs in the home cwd and captures output", async () => {
    const res = await runAgentBash('node -p "process.cwd()"');
    expect(res.exitCode).toBe(0);
    expect(res.stdout.trim()).toBe(homedir());
  });

  it("reports failures and caps output", async () => {
    const fail = await runAgentBash('node -e "process.exit(3)"');
    expect(fail.exitCode).toBe(3);
    const big = await runAgentBash(
      "node -e \"process.stdout.write('x'.repeat(20000))\"",
    );
    expect(big.stdout.length).toBeLessThanOrEqual(8192);
    expect(big.truncated).toBe(true);
  });
});
