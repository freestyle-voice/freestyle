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

export async function pasteIntoFocusedApp(text: string): Promise<void> {
  if (!text) return;

  const prior = clipboard.readText();
  clipboard.writeText(text);

  try {
    await new Promise((r) => setTimeout(r, 15));

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

    await new Promise((r) => setTimeout(r, 80));
  } finally {
    clipboard.writeText(prior);
  }
}
