import { writeFile as writeFileToDisk } from "node:fs/promises";
import path from "node:path";

type AgentFileWrite = (
  file: string,
  content: string,
  encoding: "utf8",
) => Promise<void>;

export type AgentDownloadResult =
  | { ok: true; filename: string }
  | {
      ok: false;
      reason:
        | "bad-args"
        | "invalid-filename"
        | "permission-denied"
        | "not-found"
        | "write-failed";
    };

interface SaveAgentDownloadOptions {
  downloadsDir: string;
  writeFile?: AgentFileWrite;
}

function safeDownloadFilename(input: unknown): string | null {
  if (typeof input !== "string" || input.trim().length === 0) return null;
  if (
    input === "." ||
    input === ".." ||
    input.includes("/") ||
    input.includes("\\") ||
    input.includes(":") ||
    input.includes("\0") ||
    path.basename(input) !== input ||
    path.win32.basename(input) !== input
  ) {
    return null;
  }
  return input;
}

export async function saveAgentDownload(
  input: unknown,
  { downloadsDir, writeFile = writeFileToDisk }: SaveAgentDownloadOptions,
): Promise<AgentDownloadResult> {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "bad-args" };
  }
  const { filename: rawFilename, content } = input as Record<string, unknown>;
  const filename = safeDownloadFilename(rawFilename);
  if (!filename) return { ok: false, reason: "invalid-filename" };
  if (typeof content !== "string") return { ok: false, reason: "bad-args" };

  try {
    await writeFile(path.join(downloadsDir, filename), content, "utf8");
    return { ok: true, filename };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EACCES" || code === "EPERM") {
      return { ok: false, reason: "permission-denied" };
    }
    if (code === "ENOENT") return { ok: false, reason: "not-found" };
    return { ok: false, reason: "write-failed" };
  }
}

interface IpcMainLike {
  handle: (
    channel: string,
    listener: (event: unknown, input: unknown) => Promise<AgentDownloadResult>,
  ) => void;
}

export function registerAgentFileIpc(
  ipcMain: IpcMainLike,
  getDownloadsPath: () => string,
  { writeFile }: Pick<SaveAgentDownloadOptions, "writeFile"> = {},
): void {
  ipcMain.handle("agent:save-file", (_event, input) =>
    saveAgentDownload(input, {
      downloadsDir: getDownloadsPath(),
      ...(writeFile ? { writeFile } : {}),
    }),
  );
}
