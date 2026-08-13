import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  it("absolute paths pass through; relative resolve against home", () => {
    expect(resolveAgentPath("/etc/hosts").full).toBe("/etc/hosts");
    expect(resolveAgentPath("Documents/x.txt").full).toBe(
      path.join(homedir(), "Documents", "x.txt"),
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
  it("runs in the home cwd and captures output", async () => {
    const res = await runAgentBash("pwd");
    expect(res.exitCode).toBe(0);
    expect(res.stdout.trim()).toBe(homedir());
  });

  it("reports failures and caps output", async () => {
    const fail = await runAgentBash("exit 3");
    expect(fail.exitCode).toBe(3);
    const big = await runAgentBash("yes x | head -c 20000");
    expect(big.stdout.length).toBeLessThanOrEqual(8192);
    expect(big.truncated).toBe(true);
  });
});
