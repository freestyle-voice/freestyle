import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentFileSaveGrants,
  registerAgentFileIpc,
  saveAgentDownload,
} from "./agent-files";

let downloadsDir: string | undefined;

afterEach(() => {
  if (downloadsDir) rmSync(downloadsDir, { recursive: true, force: true });
  downloadsDir = undefined;
});

describe("agent Downloads saves", () => {
  it("writes UTF-8 content under the supplied Downloads folder", async () => {
    downloadsDir = mkdtempSync(path.join(tmpdir(), "agent-downloads-"));

    await expect(
      saveAgentDownload(
        { filename: "plan.md", content: "\u00a1Hola, Freestyle!" },
        { downloadsDir },
      ),
    ).resolves.toEqual({ ok: true, filename: "plan.md" });

    expect(readFileSync(path.join(downloadsDir, "plan.md"), "utf8")).toBe(
      "\u00a1Hola, Freestyle!",
    );
  });

  it("rejects path traversal without writing a file", async () => {
    downloadsDir = mkdtempSync(path.join(tmpdir(), "agent-downloads-"));

    await expect(
      saveAgentDownload(
        { filename: "../outside.md", content: "do not write" },
        { downloadsDir },
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid-filename" });
  });

  it("preserves an existing download by saving the next collision-safe name", async () => {
    downloadsDir = mkdtempSync(path.join(tmpdir(), "agent-downloads-"));
    writeFileSync(path.join(downloadsDir, "plan.md"), "existing", "utf8");

    await expect(
      saveAgentDownload(
        { filename: "plan.md", content: "new plan" },
        { downloadsDir },
      ),
    ).resolves.toEqual({ ok: true, filename: "plan (1).md" });

    expect(readFileSync(path.join(downloadsDir, "plan.md"), "utf8")).toBe(
      "existing",
    );
    expect(readFileSync(path.join(downloadsDir, "plan (1).md"), "utf8")).toBe(
      "new plan",
    );
  });

  it("requires a main-process grant before saving through IPC", async () => {
    const handlers = new Map<
      string,
      (event: unknown, input: unknown) => Promise<unknown>
    >();
    const handle = vi.fn(
      (
        channel: string,
        handler: (event: unknown, input: unknown) => Promise<unknown>,
      ) => {
        handlers.set(channel, handler);
      },
    );
    const getDownloadsPath = vi.fn(() => "/safe/downloads");
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const panel = { id: 1 };

    registerAgentFileIpc({ handle }, getDownloadsPath, {
      writeFile,
      isPanelSender: (sender) => sender === panel,
      confirmSave: vi.fn().mockResolvedValue(true),
    });

    const handler = handlers.get("agent:save-file")!;
    await expect(
      handler(
        { sender: panel },
        { toolCallId: "call-1", filename: "report.txt", content: "safe" },
      ),
    ).resolves.toEqual({ ok: false, reason: "approval-required" });

    expect(writeFile).not.toHaveBeenCalled();
  });

  it("denies a save request from a renderer other than the approved panel", async () => {
    const handlers = new Map<
      string,
      (event: unknown, input: unknown) => Promise<unknown>
    >();
    const handle = vi.fn(
      (
        channel: string,
        handler: (event: unknown, input: unknown) => Promise<unknown>,
      ) => {
        handlers.set(channel, handler);
      },
    );
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const panel = { id: 1 };

    registerAgentFileIpc({ handle }, () => "/safe/downloads", {
      writeFile,
      isPanelSender: (sender) => sender === panel,
      confirmSave: vi.fn().mockResolvedValue(true),
    });

    await expect(
      handlers.get("agent:save-file")!(
        { sender: { id: 2 } },
        {
          toolCallId: "call-1",
          filename: "report.txt",
          content: "safe",
          grant: "forged",
        },
      ),
    ).resolves.toEqual({ ok: false, reason: "approval-denied" });

    expect(writeFile).not.toHaveBeenCalled();
  });

  it("consumes each approved grant exactly once", async () => {
    const handlers = new Map<
      string,
      (event: unknown, input: unknown) => Promise<unknown>
    >();
    const handle = vi.fn(
      (
        channel: string,
        handler: (event: unknown, input: unknown) => Promise<unknown>,
      ) => {
        handlers.set(channel, handler);
      },
    );
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const panel = { id: 1 };

    registerAgentFileIpc({ handle }, () => "/safe/downloads", {
      writeFile,
      isPanelSender: (sender) => sender === panel,
      confirmSave: vi.fn().mockResolvedValue(true),
    });

    const input = {
      toolCallId: "call-1",
      filename: "report.txt",
      content: "safe",
    };
    const grant = await handlers.get("agent:grant-file-save")!(
      { sender: panel },
      input,
    );

    expect(grant).toMatchObject({ ok: true });
    const granted = grant as { grant: string };
    await expect(
      handlers.get("agent:save-file")!(
        { sender: panel },
        { ...input, grant: granted.grant },
      ),
    ).resolves.toEqual({ ok: true, filename: "report.txt" });
    await expect(
      handlers.get("agent:save-file")!(
        { sender: panel },
        { ...input, grant: granted.grant },
      ),
    ).resolves.toEqual({ ok: false, reason: "approval-used" });

    expect(writeFile).toHaveBeenCalledWith(
      "/safe/downloads/report.txt",
      "safe",
      { encoding: "utf8", flag: "wx" },
    );
  });

  it("rejects a grant after its short main-process lifetime", async () => {
    const handlers = new Map<
      string,
      (event: unknown, input: unknown) => Promise<unknown>
    >();
    const handle = vi.fn(
      (
        channel: string,
        handler: (event: unknown, input: unknown) => Promise<unknown>,
      ) => {
        handlers.set(channel, handler);
      },
    );
    const panel = { id: 1 };
    let now = 1_000;
    const grants = new AgentFileSaveGrants({
      now: () => now,
      issueToken: () => "grant-1",
      ttlMs: 10,
    });

    registerAgentFileIpc({ handle }, () => "/safe/downloads", {
      isPanelSender: (sender) => sender === panel,
      confirmSave: vi.fn().mockResolvedValue(true),
      grants,
    });

    const input = {
      toolCallId: "call-1",
      filename: "report.txt",
      content: "safe",
    };
    const granted = (await handlers.get("agent:grant-file-save")!(
      { sender: panel },
      input,
    )) as { grant: string };
    now += 11;

    await expect(
      handlers.get("agent:save-file")!(
        { sender: panel },
        { ...input, grant: granted.grant },
      ),
    ).resolves.toEqual({ ok: false, reason: "approval-expired" });
  });
});
