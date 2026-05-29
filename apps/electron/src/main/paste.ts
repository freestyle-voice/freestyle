import { exec, execFile } from "node:child_process";
import { clipboard } from "electron";
import { getNativeBinaryPath } from "./native-binary";

function execAsync(cmd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(cmd, (err) => (err ? reject(err) : resolve()));
  });
}

function execFileAsync(path: string, args: string[] = []): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(path, args, (err) => {
      if (err) {
        const exitCode =
          typeof (err as { status?: unknown }).status === "number"
            ? (err as { status: number }).status
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

async function pasteMac(): Promise<"native" | "legacy"> {
  const binaryPath = getNativeBinaryPath("macos-fast-paste");
  if (binaryPath) {
    const exitCode = await execFileAsync(binaryPath);
    if (exitCode === 2) {
      console.warn(
        "[paste] No accessibility permission (native binary exit 2), falling back to osascript",
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

async function pasteLinux(): Promise<"native" | "legacy"> {
  const binaryPath = getNativeBinaryPath("linux-fast-paste");
  if (binaryPath) {
    const args: string[] = [];
    if (process.env.XDG_SESSION_TYPE === "wayland") {
      args.push("--portal");
    }
    const exitCode = await execFileAsync(binaryPath, args);
    if (exitCode !== 0) {
      console.warn(
        `[paste] Native paste failed (exit ${exitCode}), falling back to xdotool/wtype`,
      );
      await pasteLinuxLegacy();
      return "legacy";
    }
    return "native";
  }
  await pasteLinuxLegacy();
  return "legacy";
}

async function pasteLinuxLegacy(): Promise<void> {
  try {
    await execAsync("xdotool key ctrl+v");
  } catch {
    await execAsync("wtype -M ctrl -P v -p v -m ctrl");
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

export async function pasteIntoFocusedApp(text: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.log("[paste] text:", JSON.stringify(text));
  }
  if (!text?.trim()) return;

  // Detect if we have native binaries for faster settle times
  const hasNative =
    (process.platform === "darwin" &&
      getNativeBinaryPath("macos-fast-paste") !== null) ||
    (process.platform === "win32" &&
      getNativeBinaryPath("windows-fast-paste") !== null) ||
    (process.platform === "linux" &&
      getNativeBinaryPath("linux-fast-paste") !== null);

  const prior = clipboard.readText();
  clipboard.writeText(text);

  // Verify the clipboard write actually took effect before pasting.
  // Electron's clipboard API is synchronous on the main thread, but a
  // short spin-wait guards against external clipboard managers that may
  // overwrite the value immediately after our write.
  for (let i = 0; i < 5; i++) {
    if (clipboard.readText() === text) break;
    await new Promise((r) => setTimeout(r, 10));
    clipboard.writeText(text);
  }

  try {
    let method: "native" | "legacy" = "legacy";
    switch (process.platform) {
      case "darwin":
        method = await pasteMac();
        break;
      case "win32":
        method = await pasteWindows();
        break;
      default:
        method = await pasteLinux();
        break;
    }

    const settleTable =
      method === "native" ? PASTE_SETTLE_MS : PASTE_SETTLE_LEGACY_MS;
    const settleMs = settleTable[process.platform] ?? 500;
    await new Promise((r) => setTimeout(r, settleMs));
  } finally {
    clipboard.writeText(prior);
  }
}
