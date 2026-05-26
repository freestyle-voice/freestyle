import { exec } from "node:child_process";
import { clipboard } from "electron";

function execAsync(cmd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(cmd, (err) => (err ? reject(err) : resolve()));
  });
}

async function pasteMac(): Promise<void> {
  await execAsync(
    `osascript -e 'tell application "System Events" to keystroke "v" using {command down}'`,
  );
}

async function pasteWindows(): Promise<void> {
  await execAsync(
    `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`,
  );
}

async function pasteLinux(): Promise<void> {
  try {
    await execAsync("xdotool key ctrl+v");
  } catch {
    await execAsync("wtype -M ctrl -P v -p v -m ctrl");
  }
}

// Time the target app needs to read the clipboard after the simulated
// keystroke lands.  AppleScript/PowerShell return once the keystroke is
// *sent*, not consumed, so we must wait before restoring.
const PASTE_SETTLE_MS: Record<string, number> = {
  darwin: 500,
  win32: 600,
  linux: 300,
};

export async function pasteIntoFocusedApp(text: string): Promise<void> {
  console.log("[paste] text:", JSON.stringify(text));
  if (!text?.trim()) return;

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
    switch (process.platform) {
      case "darwin":
        await pasteMac();
        break;
      case "win32":
        await pasteWindows();
        break;
      default:
        await pasteLinux();
        break;
    }

    const settleMs = PASTE_SETTLE_MS[process.platform] ?? 500;
    await new Promise((r) => setTimeout(r, settleMs));
  } finally {
    clipboard.writeText(prior);
  }
}
