/**
 * Global hotkey rebinding — spawns a platform listener while the user picks a
 * new shortcut in Settings. Restores the recording IPC removed in #50.
 *
 * macOS: native binary (Fn / right modifiers) + renderer DOM (Alt+Space, etc.)
 * Windows / Linux: native binary in --record mode
 */

import { type ChildProcess, spawn } from "node:child_process";
import { createAppLogger } from "@freestyle-voice/utils";
import type { WebContents } from "electron";
import { getNativeBinaryPath } from "./native-binary";

const log = createAppLogger("hotkey-recorder");

export interface HotkeyCombo {
  modifiers: string[];
  key: string | null;
}

export interface HotkeyRecorderCallbacks {
  onModifiers: (modifiers: string[]) => void;
  onCaptured: (combo: HotkeyCombo) => void;
  onCancel: () => void;
  onError?: (message: string) => void;
}

const BINARY_NAMES: Record<string, string> = {
  darwin: "macos-key-listener",
  win32: "windows-key-listener",
  linux: "linux-key-listener",
};

const MAC_RIGHT_MOD_KEYS: Record<string, string> = {
  rightoption: "RightOption",
  rightcommand: "RightCommand",
  rightcontrol: "RightControl",
  rightshift: "RightShift",
};

const RIGHT_MODIFIER_KEYS: Record<string, string> = {
  RightOption: "Alt",
  RightAlt: "Alt",
  RightCommand: "Command",
  RightControl: "Control",
  RightShift: "Shift",
  RightSuper: "Super",
};

const MAC_FLAG_MODIFIERS: Record<string, string> = {
  control: "Control",
  option: "Alt",
  shift: "Shift",
  command: "Command",
};

export class HotkeyRecorder {
  private process: ChildProcess | null = null;
  private target: WebContents | null = null;
  private callbacks: HotkeyRecorderCallbacks;
  private pendingModifiers: string[] = [];

  constructor(callbacks: HotkeyRecorderCallbacks) {
    this.callbacks = callbacks;
  }

  start(target: WebContents): boolean {
    this.stop();
    this.target = target;
    this.pendingModifiers = [];

    const binaryName = BINARY_NAMES[process.platform];
    if (!binaryName) {
      this.callbacks.onError?.(`Unsupported platform: ${process.platform}`);
      return false;
    }

    const binaryPath = getNativeBinaryPath(binaryName);
    if (!binaryPath) {
      this.callbacks.onError?.(
        `Native key listener binary not found: ${binaryName}`,
      );
      return false;
    }

    const args: string[] = [];
    if (process.platform !== "darwin") {
      args.push("--record");
    } else {
      args.push("MouseButton4,MouseButton5");
    }

    try {
      this.process = spawn(binaryPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      this.callbacks.onError?.(
        `Failed to spawn hotkey recorder: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }

    let lineBuffer = "";

    this.process.stdout?.on("data", (data: Buffer) => {
      lineBuffer += data.toString();
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";

      for (const line of lines) {
        this.handleLine(line.trim());
      }
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      log.debug(data.toString().trim());
    });

    this.process.on("close", () => {
      const unexpected = this.target !== null;
      this.process = null;
      if (unexpected) {
        this.callbacks.onError?.("Hotkey recorder process exited");
      }
    });

    this.process.on("error", (err) => {
      this.callbacks.onError?.(`Hotkey recorder process error: ${err.message}`);
      this.process = null;
    });

    return true;
  }

  stop(): void {
    this.target = null;
    this.pendingModifiers = [];

    if (this.process) {
      try {
        this.process.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      this.process = null;
    }
  }

  private sendModifiers(modifiers: string[]): void {
    this.pendingModifiers = modifiers;
    this.target?.send("hotkey-record:modifiers", modifiers);
    this.callbacks.onModifiers(modifiers);
  }

  private sendCaptured(combo: HotkeyCombo): void {
    this.target?.send("hotkey-record:captured", combo);
    this.callbacks.onCaptured(combo);
  }

  private sendReleased(): void {
    this.target?.send("hotkey-record:released");
  }

  private sendCancel(): void {
    this.target?.send("hotkey-record:cancel");
    this.callbacks.onCancel();
    this.stop();
  }

  private handleLine(line: string): void {
    if (!line || line === "READY") return;

    if (line === "RECORD_CANCEL") {
      this.sendCancel();
      return;
    }

    if (line.startsWith("RECORD_MODIFIERS:")) {
      const raw = line.slice("RECORD_MODIFIERS:".length);
      const modifiers = raw ? raw.split(",").filter(Boolean) : [];
      this.sendModifiers(modifiers);
      return;
    }

    if (line.startsWith("RECORD_KEY:")) {
      const key = line.slice("RECORD_KEY:".length);
      if (key) {
        this.sendCaptured({ modifiers: [...this.pendingModifiers], key });
      }
      return;
    }

    if (line.startsWith("RECORD_RELEASE")) {
      this.sendReleased();
      return;
    }

    if (process.platform !== "darwin") return;

    if (line.startsWith("FLAGS:")) {
      const raw = line.slice("FLAGS:".length);
      const modifiers = raw
        ? raw
            .split(",")
            .map((part) => MAC_FLAG_MODIFIERS[part.trim().toLowerCase()])
            .filter((part): part is string => Boolean(part))
        : [];
      this.sendModifiers(modifiers);
      return;
    }

    if (line === "FN_DOWN" || line.startsWith("FN_DOWN:")) {
      const chordMods =
        line === "FN_DOWN"
          ? []
          : line
              .slice("FN_DOWN:".length)
              .split(",")
              .map((part) => MAC_FLAG_MODIFIERS[part.trim().toLowerCase()])
              .filter((part): part is string => Boolean(part));
      this.sendModifiers([...this.pendingModifiers, ...chordMods, "Fn"]);
      return;
    }

    if (line === "FN_UP") {
      this.sendReleased();
      return;
    }

    if (line.startsWith("MOUSE_BUTTON_DOWN:")) {
      const key = line.slice("MOUSE_BUTTON_DOWN:".length);
      if (key) {
        this.sendCaptured({ modifiers: [...this.pendingModifiers], key });
      }
      return;
    }

    if (line.startsWith("MOUSE_BUTTON_UP:")) {
      this.sendReleased();
      return;
    }

    if (line.startsWith("RIGHT_MOD_DOWN:")) {
      const modName = line.slice("RIGHT_MOD_DOWN:".length);
      const key = MAC_RIGHT_MOD_KEYS[modName.toLowerCase()] ?? modName;
      const modifier = RIGHT_MODIFIER_KEYS[key] ?? key;
      this.sendModifiers([...this.pendingModifiers, modifier]);
      return;
    }

    if (line.startsWith("RIGHT_MOD_UP:") || line.startsWith("MODIFIER_UP:")) {
      this.sendReleased();
    }
  }
}
