/**
 * Linux system-setup checks surfaced during onboarding.
 *
 * Linux has no permission prompts like macOS — instead, the global hotkey
 * listener needs read access to /dev/input (the `input` group), and the
 * legacy paste fallback needs xdotool (X11) or wtype (Wayland). These checks
 * let the UI explain missing pieces up front instead of failing silently
 * mid-dictation.
 */
import { exec } from "node:child_process";
import { accessSync, constants, readdirSync } from "node:fs";
import { isWaylandSession } from "./paste";

export interface LinuxSetupStatus {
  wayland: boolean;
  /** Can read at least one /dev/input/event* device (global hotkey listener). */
  inputAccess: boolean;
  /** The paste fallback tool this session needs (xdotool or wtype). */
  pasteToolRequired: string;
  /** Same as pasteToolRequired when installed, null when missing. */
  pasteTool: string | null;
}

function hasCommand(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec(`command -v ${cmd}`, (err) => resolve(!err));
  });
}

function hasInputAccess(): boolean {
  try {
    return readdirSync("/dev/input")
      .filter((name) => name.startsWith("event"))
      .some((name) => {
        try {
          accessSync(`/dev/input/${name}`, constants.R_OK);
          return true;
        } catch {
          return false;
        }
      });
  } catch {
    return false;
  }
}

export async function checkLinuxSetup(): Promise<LinuxSetupStatus> {
  const wayland = isWaylandSession();
  const pasteToolRequired = wayland ? "wtype" : "xdotool";
  const pasteTool = (await hasCommand(pasteToolRequired))
    ? pasteToolRequired
    : null;
  return {
    wayland,
    inputAccess: hasInputAccess(),
    pasteToolRequired,
    pasteTool,
  };
}
