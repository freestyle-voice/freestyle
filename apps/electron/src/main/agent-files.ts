import { createHash, randomUUID } from "node:crypto";
import { writeFile as writeFileToDisk } from "node:fs/promises";
import path from "node:path";

const GRANT_TTL_MS = 30_000;
const MAX_FILENAME_COLLISIONS = 1_000;

type AgentFileWrite = (
  file: string,
  content: string,
  options: { encoding: "utf8"; flag: "wx" },
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

export type AgentFileGrantResult =
  | { ok: true; grant: string }
  | {
      ok: false;
      reason:
        | "bad-args"
        | "user-declined"
        | "approval-denied"
        | "approval-required"
        | "approval-used"
        | "approval-expired";
    };

interface AgentFileIntent {
  toolCallId: string;
  filename: string;
  content: string;
}

interface SaveAgentDownloadOptions {
  downloadsDir: string;
  writeFile?: AgentFileWrite;
}

interface AgentFileGrantOptions {
  now?: () => number;
  issueToken?: () => string;
  ttlMs?: number;
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

function parseAgentFileIntent(input: unknown): AgentFileIntent | null {
  if (!input || typeof input !== "object") return null;
  const {
    toolCallId,
    filename: rawFilename,
    content,
  } = input as Record<string, unknown>;
  const filename = safeDownloadFilename(rawFilename);
  if (
    typeof toolCallId !== "string" ||
    toolCallId.length === 0 ||
    toolCallId.length > 200 ||
    !filename ||
    typeof content !== "string"
  ) {
    return null;
  }
  return { toolCallId, filename, content };
}

function intentFingerprint(intent: AgentFileIntent): string {
  return createHash("sha256")
    .update(intent.toolCallId)
    .update("\0")
    .update(intent.filename)
    .update("\0")
    .update(intent.content)
    .digest("hex");
}

function collisionName(filename: string, index: number): string {
  if (index === 0) return filename;
  const { name, ext } = path.parse(filename);
  return `${name} (${index})${ext}`;
}

export class AgentFileSaveGrants {
  readonly #pending = new Map<
    string,
    { sender: unknown; fingerprint: string; expiresAt: number }
  >();
  readonly #used = new Map<string, number>();
  readonly #expired = new Map<string, number>();
  readonly #now: () => number;
  readonly #issueToken: () => string;
  readonly #ttlMs: number;

  constructor({
    now = Date.now,
    issueToken = randomUUID,
    ttlMs = GRANT_TTL_MS,
  }: AgentFileGrantOptions = {}) {
    this.#now = now;
    this.#issueToken = issueToken;
    this.#ttlMs = ttlMs;
  }

  issue(sender: unknown, intent: AgentFileIntent): string {
    this.#clearExpired();
    const grant = this.#issueToken();
    this.#pending.set(grant, {
      sender,
      fingerprint: intentFingerprint(intent),
      expiresAt: this.#now() + this.#ttlMs,
    });
    return grant;
  }

  consume(
    sender: unknown,
    intent: AgentFileIntent,
    grant: unknown,
  ): Exclude<AgentFileGrantResult, { ok: true }> | { ok: true } {
    this.#clearExpired();
    if (typeof grant !== "string" || grant.length === 0) {
      return { ok: false, reason: "approval-required" };
    }
    const record = this.#pending.get(grant);
    if (!record) {
      return {
        ok: false,
        reason: this.#used.has(grant)
          ? "approval-used"
          : this.#expired.has(grant)
            ? "approval-expired"
            : "approval-required",
      };
    }
    if (
      record.sender !== sender ||
      record.fingerprint !== intentFingerprint(intent)
    ) {
      return { ok: false, reason: "approval-denied" };
    }
    this.#pending.delete(grant);
    this.#used.set(grant, record.expiresAt);
    return { ok: true };
  }

  #clearExpired(): void {
    const now = this.#now();
    for (const [grant, record] of this.#pending) {
      if (record.expiresAt <= now) {
        this.#pending.delete(grant);
        this.#expired.set(grant, now + this.#ttlMs);
      }
    }
    for (const [grant, expiresAt] of this.#used) {
      if (expiresAt <= now) this.#used.delete(grant);
    }
    for (const [grant, expiresAt] of this.#expired) {
      if (expiresAt <= now) this.#expired.delete(grant);
    }
  }
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

  for (let index = 0; index < MAX_FILENAME_COLLISIONS; index += 1) {
    const finalFilename = collisionName(filename, index);
    try {
      await writeFile(path.join(downloadsDir, finalFilename), content, {
        encoding: "utf8",
        flag: "wx",
      });
      return { ok: true, filename: finalFilename };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "EEXIST") continue;
      if (code === "EACCES" || code === "EPERM") {
        return { ok: false, reason: "permission-denied" };
      }
      if (code === "ENOENT") return { ok: false, reason: "not-found" };
      return { ok: false, reason: "write-failed" };
    }
  }
  return { ok: false, reason: "write-failed" };
}

interface IpcMainLike {
  handle: (
    channel: string,
    listener: (event: unknown, input: unknown) => Promise<unknown>,
  ) => void;
}

interface AgentFileIpcOptions {
  writeFile?: AgentFileWrite;
  isPanelSender: (sender: unknown) => boolean;
  confirmSave: (intent: {
    toolCallId: string;
    filename: string;
  }) => Promise<boolean>;
  grants?: AgentFileSaveGrants;
}

function senderFrom(event: unknown): unknown {
  return event && typeof event === "object"
    ? (event as { sender?: unknown }).sender
    : undefined;
}

export function registerAgentFileIpc(
  ipcMain: IpcMainLike,
  getDownloadsPath: () => string,
  {
    writeFile,
    isPanelSender,
    confirmSave,
    grants = new AgentFileSaveGrants(),
  }: AgentFileIpcOptions,
): void {
  ipcMain.handle("agent:grant-file-save", async (event, input) => {
    const sender = senderFrom(event);
    if (!isPanelSender(sender)) return { ok: false, reason: "approval-denied" };
    const intent = parseAgentFileIntent(input);
    if (!intent) return { ok: false, reason: "bad-args" };
    if (!(await confirmSave(intent)))
      return { ok: false, reason: "user-declined" };
    return { ok: true, grant: grants.issue(sender, intent) };
  });

  ipcMain.handle("agent:save-file", async (event, input) => {
    const sender = senderFrom(event);
    if (!isPanelSender(sender)) return { ok: false, reason: "approval-denied" };
    const intent = parseAgentFileIntent(input);
    if (!intent) return { ok: false, reason: "bad-args" };
    const granted = grants.consume(
      sender,
      intent,
      (input as Record<string, unknown>).grant,
    );
    if (!granted.ok) return granted;
    return saveAgentDownload(intent, {
      downloadsDir: getDownloadsPath(),
      ...(writeFile ? { writeFile } : {}),
    });
  });
}
