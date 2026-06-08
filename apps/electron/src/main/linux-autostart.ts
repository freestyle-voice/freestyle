/**
 * XDG-compliant autostart for Linux.
 *
 * On Linux, Electron's `app.setLoginItemSettings` / `app.getLoginItemSettings`
 * are no-ops.  This module manages a `.desktop` file in
 * `$XDG_CONFIG_HOME/autostart/` (defaulting to `~/.config/autostart/`) so
 * that the app starts automatically on login.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DESKTOP_FILENAME = "freestyle.desktop";

function getAutostartDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(xdgConfig, "autostart");
}

function getDesktopFilePath(): string {
  return join(getAutostartDir(), DESKTOP_FILENAME);
}

function buildDesktopEntry(): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Freestyle",
    `Exec="${process.execPath}"`,
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

export function isEnabled(): boolean {
  const filePath = getDesktopFilePath();
  if (!existsSync(filePath)) return false;
  try {
    const content = readFileSync(filePath, "utf-8");
    return content.includes("X-GNOME-Autostart-enabled=true");
  } catch {
    return false;
  }
}

export function setEnabled(enabled: boolean): void {
  const filePath = getDesktopFilePath();
  if (enabled) {
    const dir = getAutostartDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, buildDesktopEntry(), "utf-8");
  } else {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}
