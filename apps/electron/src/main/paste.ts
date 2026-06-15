import { exec, execFile } from "node:child_process";
import { createAppLogger } from "@freestyle/utils";
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

function linuxPasteArgs(wayland: boolean, isTerminal: boolean): string[] {
  if (wayland) {
    return isTerminal ? ["--uinput", "--terminal"] : ["--uinput"];
  }
  return isTerminal ? ["--terminal"] : [];
}

async function pasteLinux(isTerminal: boolean): Promise<PasteMethod> {
  const binaryPath = getNativeBinaryPath("linux-fast-paste");
  const wayland = isWaylandSession();

  if (wayland) {
    return pasteLinuxWayland(binaryPath, isTerminal);
  }

  if (binaryPath) {
    const exitCode = await execFileAsync(
      binaryPath,
      linuxPasteArgs(false, isTerminal),
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

async function pasteLinuxWayland(
  binaryPath: string | null,
  isTerminal: boolean,
): Promise<PasteMethod> {
  if (binaryPath) {
    const exitCode = await execFileAsync(
      binaryPath,
      linuxPasteArgs(true, isTerminal),
    );
    if (exitCode === 0) {
      return "legacy";
    }
    log.warn(
      `Native uinput paste failed (exit ${exitCode}), falling back to wtype`,
    );
  }

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

// Native binaries inject keystrokes directly at the OS level, so the target
// app receives them much faster than shell-spawned commands. Settle times
// are reduced accordingly. If using the legacy fallback, the original higher
// values are used.
const PASTE_SETTLE_MS: Record<string, number> = {
  darwin: 150,
  win32: 150,
  linux: 100,
};

const PASTE_SETTLE_LEGACY_MS: Record<string, number> = {
  darwin: 500,
  win32: 600,
  linux: 300,
};

export async function pasteIntoFocusedApp(
  text: string,
  beforePaste?: () => Promise<void> | void,
): Promise<void> {
  log.debug(`text: ${JSON.stringify(text)}`);
  if (!text?.trim()) return;

  const prior = clipboard.readText();
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

    const settleTable =
      method === "native" ? PASTE_SETTLE_MS : PASTE_SETTLE_LEGACY_MS;
    const settleMs = settleTable[process.platform] ?? 500;
    await new Promise((r) => setTimeout(r, settleMs));
  } finally {
    // When every paste backend failed, the clipboard is the only copy of the
    // transcript the user still has — leave it there instead of restoring.
    if (pasted) {
      try {
        clipboard.writeText(prior);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Failed to restore clipboard: ${message}`);
      }
    }
  }
}
