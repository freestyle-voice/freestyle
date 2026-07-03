import {
  type ChildProcessWithoutNullStreams,
  exec,
  execFile,
  spawn,
} from "node:child_process";
import { createAppLogger } from "@freestyle-voice/utils";
import { clipboard } from "electron";
import { isLinuxTerminalFocused } from "./linux-terminal-focus";
import { getNativeBinaryPath } from "./native-binary";

const log = createAppLogger("paste");

function execAsync(cmd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(cmd, (err) => (err ? reject(err) : resolve()));
  });
}

async function tryExecAsync(cmd: string, label: string): Promise<boolean> {
  try {
    await execAsync(cmd);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`${label} failed: ${message}`);
    return false;
  }
}

function execFileAsync(path: string, args: string[] = []): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(path, args, (err) => {
      if (err) {
        const status = (err as { status?: unknown }).status;
        const exitCode =
          typeof status === "number"
            ? status
            : typeof err.code === "number"
              ? err.code
              : undefined;
        if (exitCode !== undefined) {
          resolve(exitCode);
        } else {
          reject(err);
        }
      } else {
        resolve(0);
      }
    });
  });
}

export function isWaylandSession(): boolean {
  return (
    process.env.XDG_SESSION_TYPE?.toLowerCase() === "wayland" ||
    Boolean(process.env.WAYLAND_DISPLAY)
  );
}

async function pasteMac(): Promise<"native" | "legacy"> {
  const binaryPath = getNativeBinaryPath("macos-fast-paste");
  if (binaryPath) {
    const exitCode = await execFileAsync(binaryPath);
    if (exitCode === 2) {
      log.warn(
        "No accessibility permission (native binary exit 2), falling back to osascript",
      );
      await execAsync(
        `osascript -e 'tell application "System Events" to keystroke "v" using {command down}'`,
      );
      return "legacy";
    } else if (exitCode !== 0) {
      throw new Error(`macos-fast-paste exited with code ${exitCode}`);
    }
    return "native";
  }
  await execAsync(
    `osascript -e 'tell application "System Events" to keystroke "v" using {command down}'`,
  );
  return "legacy";
}

async function pasteWindows(): Promise<"native" | "legacy"> {
  const binaryPath = getNativeBinaryPath("windows-fast-paste");
  if (binaryPath) {
    const exitCode = await execFileAsync(binaryPath);
    if (exitCode !== 0) {
      throw new Error(`windows-fast-paste exited with code ${exitCode}`);
    }
    return "native";
  }
  await execAsync(
    `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`,
  );
  return "legacy";
}

type PasteMethod = "native" | "legacy";

let linuxUinputHelper: ChildProcessWithoutNullStreams | null = null;
let linuxUinputReady = false;
let linuxUinputStarting: Promise<boolean> | null = null;
let linuxUinputLineBuffer = "";
let linuxUinputPendingResponse: ((success: boolean) => void) | null = null;
let linuxUinputCommandChain: Promise<unknown> = Promise.resolve();

function settleLinuxUinputResponse(success: boolean): void {
  const resolve = linuxUinputPendingResponse;
  linuxUinputPendingResponse = null;
  resolve?.(success);
}

function clearLinuxUinputHelper(helper: ChildProcessWithoutNullStreams): void {
  if (linuxUinputHelper !== helper) return;
  linuxUinputHelper = null;
  linuxUinputReady = false;
  linuxUinputStarting = null;
  linuxUinputLineBuffer = "";
  settleLinuxUinputResponse(false);
}

function handleLinuxUinputLine(line: string): void {
  if (line === "READY") {
    linuxUinputReady = true;
    return;
  }
  if (line === "OK") {
    settleLinuxUinputResponse(true);
    return;
  }
  if (line.startsWith("ERROR")) {
    log.warn(`Persistent uinput helper: ${line}`);
    settleLinuxUinputResponse(false);
  }
}

export function startLinuxPasteHelper(): Promise<boolean> {
  if (process.platform !== "linux" || !isWaylandSession()) {
    return Promise.resolve(false);
  }
  if (linuxUinputHelper && linuxUinputReady) {
    return Promise.resolve(true);
  }
  if (linuxUinputStarting) return linuxUinputStarting;

  const binaryPath = getNativeBinaryPath("linux-fast-paste");
  if (!binaryPath) return Promise.resolve(false);

  linuxUinputStarting = new Promise<boolean>((resolve) => {
    const helper = spawn(binaryPath, ["--uinput-server"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    linuxUinputHelper = helper;
    let settled = false;
    let stderr = "";

    const settleStart = (success: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(success);
    };

    const timeout = setTimeout(() => {
      log.warn("Persistent uinput helper timed out during startup");
      settleStart(false);
      helper.kill("SIGTERM");
    }, 2_000);

    helper.stdout.on("data", (data: Buffer) => {
      linuxUinputLineBuffer += data.toString();
      const lines = linuxUinputLineBuffer.split("\n");
      linuxUinputLineBuffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        handleLinuxUinputLine(line);
        if (line === "READY") {
          log.debug("Persistent uinput paste helper ready");
          settleStart(true);
        }
      }
    });

    helper.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    helper.on("error", (err) => {
      log.warn(`Persistent uinput helper error: ${err.message}`);
      settleStart(false);
      clearLinuxUinputHelper(helper);
    });

    helper.on("close", (code) => {
      if (stderr.trim()) {
        log.warn(`Persistent uinput helper failed: ${stderr.trim()}`);
      } else if (linuxUinputReady && code !== 0) {
        log.warn(`Persistent uinput helper exited with code ${code}`);
      }
      settleStart(false);
      clearLinuxUinputHelper(helper);
    });
  });

  return linuxUinputStarting;
}

export function stopLinuxPasteHelper(): void {
  const helper = linuxUinputHelper;
  if (!helper) return;
  clearLinuxUinputHelper(helper);
  if (!helper.stdin.writable) {
    helper.kill("SIGTERM");
    return;
  }

  helper.stdin.end("QUIT\n");
  const forceKill = setTimeout(() => helper.kill("SIGTERM"), 250);
  forceKill.unref();
  helper.once("close", () => clearTimeout(forceKill));
}

async function sendPersistentUinputPaste(
  isTerminal: boolean,
): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    if (!(await startLinuxPasteHelper())) return false;
    const helper = linuxUinputHelper;
    if (!helper?.stdin.writable) return false;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (success: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (linuxUinputPendingResponse === settle) {
          linuxUinputPendingResponse = null;
        }
        resolve(success);
      };
      const timeout = setTimeout(() => {
        log.warn("Persistent uinput helper timed out while pasting");
        settle(false);
        clearLinuxUinputHelper(helper);
        helper.kill("SIGTERM");
      }, 1_000);

      linuxUinputPendingResponse = settle;
      const command = isTerminal ? "PASTE_TERMINAL\n" : "PASTE\n";
      helper.stdin.write(command, (err) => {
        if (err) {
          settle(false);
          clearLinuxUinputHelper(helper);
          helper.kill("SIGTERM");
        }
      });
    });
  };

  const result = linuxUinputCommandChain.then(run, run);
  linuxUinputCommandChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function linuxPasteArgs(isTerminal: boolean): string[] {
  return isTerminal ? ["--terminal"] : [];
}

async function pasteLinux(isTerminal: boolean): Promise<PasteMethod> {
  const binaryPath = getNativeBinaryPath("linux-fast-paste");
  const wayland = isWaylandSession();

  if (wayland) {
    return pasteLinuxWayland(isTerminal);
  }

  if (binaryPath) {
    const exitCode = await execFileAsync(
      binaryPath,
      linuxPasteArgs(isTerminal),
    );
    if (exitCode !== 0) {
      log.warn(
        `Native paste failed (exit ${exitCode}), falling back to xdotool`,
      );
      await pasteLinuxLegacy(false, isTerminal);
      return "legacy";
    }
    return "native";
  }
  await pasteLinuxLegacy(false, isTerminal);
  return "legacy";
}

async function pasteLinuxWayland(isTerminal: boolean): Promise<PasteMethod> {
  if (await sendPersistentUinputPaste(isTerminal)) {
    return "native";
  }

  log.warn("Persistent uinput paste failed, falling back to wtype");
  await pasteLinuxLegacy(true, isTerminal);
  return "legacy";
}

async function pasteLinuxLegacy(
  wayland: boolean,
  isTerminal: boolean,
): Promise<void> {
  if (wayland) {
    const cmd = isTerminal
      ? "wtype -M ctrl -M shift -P v -p v -m shift -m ctrl"
      : "wtype -M ctrl -P v -p v -m ctrl";
    const pasted = await tryExecAsync(cmd, "wtype paste");
    if (!pasted) {
      throw new Error("No supported Wayland paste backend succeeded");
    }
  } else {
    const key = isTerminal ? "ctrl+shift+v" : "ctrl+v";
    await execAsync(`xdotool key ${key}`);
  }
}

// The settle delay runs between sending the paste keystroke and restoring the
// prior clipboard. It is invisible to the user (the transcript has already
// been pasted) but it is the only protection against slow targets (remote
// desktop, loaded IDEs) that process Ctrl/Cmd+V after we restore — those
// would paste the OLD clipboard. Keep it generous.
const PASTE_SETTLE_MS: Record<string, number> = {
  darwin: 300,
  win32: 300,
  linux: 300,
};

const PASTE_SETTLE_LEGACY_MS: Record<string, number> = {
  darwin: 500,
  win32: 600,
  linux: 500,
};

function pasteSettleMs(method: PasteMethod): number {
  const override = Number(process.env.FREESTYLE_PASTE_SETTLE_MS);
  if (Number.isFinite(override) && override >= 0) return override;
  const table = method === "native" ? PASTE_SETTLE_MS : PASTE_SETTLE_LEGACY_MS;
  return table[process.platform] ?? 500;
}

// Clipboard flavors Electron can read back and re-write. Anything else
// (file copies, app-private data) cannot be snapshotted, so overwriting it
// with plain text on restore would destroy the user's copy.
const RESTORABLE_TEXT_FORMATS = new Set([
  "text/plain",
  "text/html",
  "text/rtf",
]);

type ClipboardSnapshot =
  | { restorable: false }
  | {
      restorable: true;
      text: string;
      html?: string;
      rtf?: string;
      image?: Electron.NativeImage;
    };

function snapshotClipboard(): ClipboardSnapshot {
  try {
    const formats = clipboard.availableFormats();
    const unknown = formats.filter(
      (f) => !RESTORABLE_TEXT_FORMATS.has(f) && !f.startsWith("image/"),
    );
    if (unknown.length > 0) {
      log.debug(
        `clipboard holds non-restorable formats (${unknown.join(", ")}); leaving transcript on clipboard after paste`,
      );
      return { restorable: false };
    }
    const hasImage = formats.some((f) => f.startsWith("image/"));
    return {
      restorable: true,
      text: clipboard.readText(),
      html: formats.includes("text/html") ? clipboard.readHTML() : undefined,
      rtf: formats.includes("text/rtf") ? clipboard.readRTF() : undefined,
      image: hasImage ? clipboard.readImage() : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to snapshot clipboard: ${message}`);
    return { restorable: false };
  }
}

function restoreClipboard(
  snapshot: ClipboardSnapshot,
  transcript: string,
): void {
  if (!snapshot.restorable) return;
  try {
    // If the clipboard no longer holds our transcript, the user (or another
    // app) copied something during the settle window — don't clobber it.
    if (clipboard.readText() !== transcript) {
      log.debug("clipboard changed since paste; skipping restore");
      return;
    }
    const data: Electron.Data = { text: snapshot.text };
    if (snapshot.html !== undefined) data.html = snapshot.html;
    if (snapshot.rtf !== undefined) data.rtf = snapshot.rtf;
    if (snapshot.image && !snapshot.image.isEmpty()) {
      data.image = snapshot.image;
    }
    clipboard.write(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to restore clipboard: ${message}`);
  }
}

// Serialized: two overlapping dictations must not interleave their clipboard
// save/paste/restore sequences.
let pasteChain: Promise<void> = Promise.resolve();

export function pasteIntoFocusedApp(
  text: string,
  beforePaste?: () => Promise<void> | void,
): Promise<void> {
  const run = (): Promise<void> => doPasteIntoFocusedApp(text, beforePaste);
  const result = pasteChain.then(run, run);
  pasteChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function doPasteIntoFocusedApp(
  text: string,
  beforePaste?: () => Promise<void> | void,
): Promise<void> {
  // Never log the transcript itself (it's persisted to the shared log file);
  // length is enough to diagnose paste issues.
  log.debug(`pasting ${text?.length ?? 0} chars`);
  if (!text?.trim()) return;

  const prior = snapshotClipboard();
  clipboard.writeText(text);

  let pasted = false;
  try {
    await beforePaste?.();

    let method: PasteMethod = "legacy";
    switch (process.platform) {
      case "darwin":
        method = await pasteMac();
        break;
      case "win32":
        method = await pasteWindows();
        break;
      default: {
        const isTerminal = await isLinuxTerminalFocused();
        if (isTerminal) {
          log.debug("focused app is a terminal, using Ctrl+Shift+V");
        }
        method = await pasteLinux(isTerminal);
        break;
      }
    }
    pasted = true;

    await new Promise((r) => setTimeout(r, pasteSettleMs(method)));
  } finally {
    // When every paste backend failed, the clipboard is the only copy of the
    // transcript the user still has — leave it there instead of restoring.
    if (pasted) {
      restoreClipboard(prior, text);
    }
  }
}
