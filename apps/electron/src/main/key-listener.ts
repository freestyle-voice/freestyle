/**
 * Native Key Listener
 *
 * Wraps the platform-specific native key listener binary. Spawns the binary
 * as a child process and parses its stdout for key events.
 *
 * Uses purpose-built native binaries that provide:
 *   - macOS: Globe/Fn key + modifier detection via Cocoa/CGEvent
 *   - Windows: True push-to-talk via WH_KEYBOARD_LL hook
 *   - Linux: /dev/input event monitoring for X11 and Wayland
 */

import { type ChildProcess, spawn } from "node:child_process";
import { getNativeBinaryPath } from "./native-binary";

type KeyEventCallback = () => void;

interface KeyListenerOptions {
  /** Electron-style hotkey accelerator, e.g. "Alt+Space" */
  hotkey: string;
  onKeyDown: KeyEventCallback;
  onKeyUp: KeyEventCallback;
  onError?: (error: string) => void;
  onReady?: () => void;
}

const BINARY_NAMES: Record<string, string> = {
  darwin: "macos-key-listener",
  win32: "windows-key-listener",
  linux: "linux-key-listener",
};

/**
 * Convert an Electron accelerator to the format expected by the native binary.
 * macOS key listener doesn't take a hotkey arg (it reports all modifier events
 * and the main process filters). Windows and Linux take the hotkey directly.
 */
function formatHotkeyForBinary(hotkey: string): string {
  // The native binaries accept Electron-style accelerator format directly
  // (e.g., "Alt+Space", "CommandOrControl+Shift+F11")
  return hotkey;
}

/**
 * Parse an Electron-style hotkey accelerator into its constituent parts
 * for matching against macOS key listener events.
 */
function parseHotkeyParts(hotkey: string): {
  modifiers: Set<string>;
  key: string | null;
} {
  const parts = hotkey.split("+").map((p) => p.trim().toLowerCase());
  const key = parts.length > 0 ? parts[parts.length - 1] : null;
  const modifiers = new Set<string>();

  for (let i = 0; i < parts.length - 1; i++) {
    const mod = parts[i];
    if (mod === "alt" || mod === "option") modifiers.add("option");
    else if (
      mod === "ctrl" ||
      mod === "control" ||
      mod === "commandorcontrol" ||
      mod === "cmdorctrl"
    )
      modifiers.add("control");
    else if (mod === "shift") modifiers.add("shift");
    else if (
      mod === "meta" ||
      mod === "super" ||
      mod === "command" ||
      mod === "cmd"
    )
      modifiers.add("command");
  }

  return { modifiers, key };
}

export class NativeKeyListener {
  private process: ChildProcess | null = null;
  private options: KeyListenerOptions;
  private destroyed = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restartAttempts = 0;
  private static readonly MAX_RESTART_ATTEMPTS = 5;
  private static readonly RESTART_DELAY_MS = 2000;

  // macOS modifier tracking for hotkey matching
  private macModState = new Set<string>();
  private macFlagState = new Set<string>();
  private macHotkeyActive = false;

  constructor(options: KeyListenerOptions) {
    this.options = options;
  }

  /**
   * Start the native key listener binary.
   * Returns true if the binary was found and spawned.
   */
  start(): boolean {
    if (this.destroyed) return false;

    const binaryName = BINARY_NAMES[process.platform];
    if (!binaryName) {
      this.options.onError?.(`Unsupported platform: ${process.platform}`);
      return false;
    }

    const binaryPath = getNativeBinaryPath(binaryName);
    if (!binaryPath) {
      this.options.onError?.(
        `Native key listener binary not found: ${binaryName}`,
      );
      return false;
    }

    const args: string[] = [];

    // macOS key listener doesn't need hotkey arg -- it reports all events
    // and the main process filters. Windows and Linux take the hotkey.
    if (process.platform !== "darwin") {
      args.push(formatHotkeyForBinary(this.options.hotkey));
    }

    try {
      this.process = spawn(binaryPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      this.options.onError?.(
        `Failed to spawn key listener: ${err instanceof Error ? err.message : String(err)}`,
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
      if (process.env.NODE_ENV !== "production") {
        console.log(`[key-listener] ${data.toString().trim()}`);
      }
    });

    this.process.on("close", (code) => {
      this.process = null;
      if (!this.destroyed && code !== 0) {
        this.scheduleRestart();
      }
    });

    this.process.on("error", (err) => {
      this.options.onError?.(`Key listener process error: ${err.message}`);
      this.process = null;
      if (!this.destroyed) {
        this.scheduleRestart();
      }
    });

    return true;
  }

  private handleLine(line: string): void {
    // Windows/Linux binaries emit KEY_DOWN/KEY_UP directly
    switch (line) {
      case "READY":
        this.restartAttempts = 0;
        this.options.onReady?.();
        return;
      case "KEY_DOWN":
        this.options.onKeyDown();
        return;
      case "KEY_UP":
        this.options.onKeyUp();
        return;
    }

    // macOS-specific event handling
    if (process.platform !== "darwin") return;

    const hotkey = this.options.hotkey.toLowerCase();

    // Fn/Globe key
    if (line === "FN_DOWN" && (hotkey === "fn" || hotkey === "globe")) {
      this.options.onKeyDown();
      return;
    }
    if (line === "FN_UP" && (hotkey === "fn" || hotkey === "globe")) {
      this.options.onKeyUp();
      return;
    }

    // Right modifier keys (e.g., RIGHT_MOD_DOWN:RightOption)
    if (line.startsWith("RIGHT_MOD_DOWN:")) {
      const modName = line.slice(15); // e.g., "RightOption"
      this.macModState.add(modName.toLowerCase());
      this.checkMacHotkeyMatch();
      return;
    }
    if (line.startsWith("RIGHT_MOD_UP:")) {
      const modName = line.slice(13);
      this.macModState.delete(modName.toLowerCase());
      if (this.macHotkeyActive) {
        this.macHotkeyActive = false;
        this.options.onKeyUp();
      }
      return;
    }

    // General modifier release (e.g., MODIFIER_UP:option)
    if (line.startsWith("MODIFIER_UP:")) {
      const modName = line.slice(12).toLowerCase();
      this.macFlagState.delete(modName);
      // Remove any right-side modifier that matches this category
      for (const key of [...this.macModState]) {
        if (key.includes(modName)) {
          this.macModState.delete(key);
        }
      }
      this.checkMacCompoundRelease();
      return;
    }

    // Left/right modifier flags (e.g., Alt+Space)
    if (line.startsWith("FLAGS:")) {
      const raw = line.slice(6);
      this.macFlagState = new Set(
        raw
          ? raw
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean)
          : [],
      );
      this.checkMacCompoundRelease();
      return;
    }

    if (line.startsWith("KEY_DOWN:")) {
      this.handleMacKeyEvent(line.slice(9), true);
      return;
    }

    if (line.startsWith("KEY_UP:")) {
      this.handleMacKeyEvent(line.slice(9), false);
      return;
    }
  }

  /** End compound hotkey when a required modifier is released (e.g. Option on Alt+Space). */
  private checkMacCompoundRelease(): void {
    if (!this.macHotkeyActive) return;

    const { modifiers, key: hotkeyKey } = parseHotkeyParts(this.options.hotkey);
    if (!hotkeyKey) return;
    const keyLower = hotkeyKey.toLowerCase();
    if (keyLower === "fn" || keyLower === "globe") return;

    const allModsMatch = [...modifiers].every((m) => this.macFlagState.has(m));
    if (!allModsMatch) {
      this.macHotkeyActive = false;
      this.options.onKeyUp();
    }
  }

  /** Match compound hotkeys like Alt+Space using modifier flags + key events. */
  private handleMacKeyEvent(key: string, down: boolean): void {
    const { modifiers, key: hotkeyKey } = parseHotkeyParts(this.options.hotkey);
    if (!hotkeyKey || hotkeyKey.toLowerCase() !== key.toLowerCase()) return;

    const allModsMatch = [...modifiers].every((m) => this.macFlagState.has(m));
    if (!allModsMatch) return;

    if (down) {
      if (!this.macHotkeyActive) {
        this.macHotkeyActive = true;
        this.options.onKeyDown();
      }
    } else if (this.macHotkeyActive) {
      this.macHotkeyActive = false;
      this.options.onKeyUp();
    }
  }

  /**
   * Check if the current macOS modifier state matches the configured hotkey.
   * Handles hotkeys like "Alt+Space" by checking if the modifier component
   * (e.g., Alt = Option) is pressed. For modifier-only hotkeys like
   * "RightOption", checks direct match.
   */
  private checkMacHotkeyMatch(): void {
    if (this.macHotkeyActive) return;

    const hotkey = this.options.hotkey.toLowerCase();
    const { modifiers, key: hotkeyKey } = parseHotkeyParts(this.options.hotkey);

    // Direct right-modifier hotkey (e.g., hotkey is literally "RightOption")
    if (this.macModState.has(hotkey)) {
      this.macHotkeyActive = true;
      this.options.onKeyDown();
      return;
    }

    // Compound hotkeys (Alt+Space, etc.) use FLAGS + KEY_DOWN — not modifier-only match
    if (hotkeyKey) {
      const keyLower = hotkeyKey.toLowerCase();
      if (keyLower !== "fn" && keyLower !== "globe") return;
    }

    if (modifiers.size === 0) return;

    // Map macOS modifier names to categories
    const modCategoryMap: Record<string, string> = {
      rightoption: "option",
      rightcommand: "command",
      rightcontrol: "control",
      rightshift: "shift",
    };

    const activeCategories = new Set<string>();
    for (const mod of this.macModState) {
      const category = modCategoryMap[mod];
      if (category) activeCategories.add(category);
    }

    // Check if all required modifiers are active
    const allModsMatch = [...modifiers].every((m) => activeCategories.has(m));
    if (allModsMatch) {
      this.macHotkeyActive = true;
      this.options.onKeyDown();
    }
  }

  private scheduleRestart(): void {
    if (this.restartAttempts >= NativeKeyListener.MAX_RESTART_ATTEMPTS) {
      this.options.onError?.(
        "Key listener exceeded max restart attempts. Give up.",
      );
      return;
    }

    this.restartAttempts++;
    const delay = NativeKeyListener.RESTART_DELAY_MS * this.restartAttempts;

    this.restartTimer = setTimeout(() => {
      if (!this.destroyed) {
        this.start();
      }
    }, delay);
  }

  /**
   * Stop the key listener and clean up.
   */
  stop(): void {
    this.destroyed = true;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.process) {
      try {
        // Send SIGTERM for graceful shutdown
        this.process.kill("SIGTERM");
      } catch {
        // Process may already be dead
      }
      this.process = null;
    }
  }

  /**
   * Update the hotkey. Restarts the listener with the new hotkey.
   */
  updateHotkey(hotkey: string): void {
    this.options.hotkey = hotkey;
    // Stop without permanently destroying
    this.destroyed = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.process) {
      const proc = this.process;
      proc.removeAllListeners();
      try {
        proc.kill("SIGTERM");
      } catch {
        // Process may already be dead
      }
      this.process = null;
    }
    this.macModState.clear();
    this.macFlagState.clear();
    this.macHotkeyActive = false;
    this.restartAttempts = 0;
    this.start();
  }

  get isRunning(): boolean {
    return this.process !== null;
  }
}
