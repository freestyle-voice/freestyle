import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAgentFileIpc, saveAgentDownload } from "./agent-files";

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

  it("registers the IPC handler with Electron's Downloads directory", async () => {
    const handle = vi.fn();
    const getDownloadsPath = vi.fn(() => "/safe/downloads");
    const writeFile = vi.fn().mockResolvedValue(undefined);

    registerAgentFileIpc({ handle }, getDownloadsPath, { writeFile });

    const handler = handle.mock.calls[0]?.[1] as (
      event: unknown,
      input: unknown,
    ) => Promise<unknown>;
    await expect(
      handler({}, { filename: "report.txt", content: "safe" }),
    ).resolves.toEqual({ ok: true, filename: "report.txt" });

    expect(getDownloadsPath).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith(
      "/safe/downloads/report.txt",
      "safe",
      "utf8",
    );
  });
});
