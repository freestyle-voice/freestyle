/**
 * Microphone Activity Listener
 *
 * Monitors microphone usage across the system using native platform binaries.
 * Event-driven with near-zero CPU usage.
 *
 *   - macOS: CoreAudio property listeners (macos-mic-listener)
 *   - Windows: WASAPI session monitoring (windows-mic-listener)
 *   - Linux: PulseAudio event subscription (pactl subscribe)
 */

import { type ChildProcess, spawn } from "node:child_process";
import { createAppLogger } from "@freestyle-voice/utils";
import { getNativeBinaryPath } from "./native-binary";

const log = createAppLogger("mic-listener");

export type MicState = "active" | "inactive" | "unknown";

interface MicListenerOptions {
  /** PID to exclude from monitoring (our own app) */
  excludePid?: number;
  onStateChange?: (state: MicState) => void;
  onError?: (error: string) => void;
}

export class MicListener {
  private process: ChildProcess | null = null;
  private options: MicListenerOptions;
  private destroyed = false;
  private currentState: MicState = "unknown";
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  /** Track active mic PIDs on Windows for accurate state transitions */
  private activePids = new Set<string>();

  constructor(options: MicListenerOptions = {}) {
    this.options = options;
  }

  get state(): MicState {
    return this.currentState;
  }

  /**
   * Start monitoring microphone activity.
   */
  start(): boolean {
    if (this.destroyed) return false;

    if (process.platform === "linux") {
      return this.startLinux();
    }

    const binaryName =
      process.platform === "darwin"
        ? "macos-mic-listener"
        : "windows-mic-listener";

    const binaryPath = getNativeBinaryPath(binaryName);
    if (!binaryPath) {
      log.debug(`Binary not found: ${binaryName}, mic detection unavailable`);
      return false;
    }

    const args: string[] = [];
    if (process.platform === "win32" && this.options.excludePid) {
      args.push("--exclude-pid", String(this.options.excludePid));
    }

    try {
      this.process = spawn(binaryPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      this.options.onError?.(
        `Failed to spawn mic listener: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }

    this.setupProcessHandlers();
    return true;
  }

  private startLinux(): boolean {
    // On Linux, use `pactl subscribe` to monitor PulseAudio events
    try {
      this.process = spawn("pactl", ["subscribe"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      log.debug("pactl not available, mic detection unavailable on Linux");
      return false;
    }

    let lineBuffer = "";
    this.process.stdout?.on("data", (data: Buffer) => {
      lineBuffer += data.toString();
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";

      for (const line of lines) {
        // pactl subscribe outputs lines like:
        // Event 'new' on source-output #42
        // Event 'remove' on source-output #42
        if (line.includes("source-output")) {
          if (line.includes("'new'")) {
            this.updateState("active");
          } else if (line.includes("'remove'")) {
            this.updateState("inactive");
          }
        }
      }
    });

    this.process.on("close", (code) => {
      this.process = null;
      // Restart only on abnormal exit — a clean exit (e.g. pactl present but
      // the PulseAudio socket is gone) would otherwise respawn every 5s
      // forever.
      if (!this.destroyed && code !== 0) {
        this.scheduleRestart();
      }
    });

    this.process.on("error", () => {
      this.process = null;
    });

    return true;
  }

  private setupProcessHandlers(): void {
    if (!this.process) return;

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

    this.process.on("close", (code) => {
      this.process = null;
      if (!this.destroyed && code !== 0) {
        this.scheduleRestart();
      }
    });

    this.process.on("error", (err) => {
      this.options.onError?.(`Mic listener error: ${err.message}`);
      this.process = null;
      if (!this.destroyed) {
        this.scheduleRestart();
      }
    });
  }

  private handleLine(line: string): void {
    if (line === "READY") {
      log.debug("Ready");
      return;
    }

    // macOS: MIC_ACTIVE / MIC_INACTIVE
    if (line === "MIC_ACTIVE") {
      this.updateState("active");
    } else if (line === "MIC_INACTIVE") {
      this.updateState("inactive");
    }
    // Windows: MIC_START <pid> / MIC_STOP <pid>
    else if (line.startsWith("MIC_START ")) {
      const pid = line.slice(10).trim();
      if (pid) this.activePids.add(pid);
      this.updateState("active");
    } else if (line.startsWith("MIC_STOP ")) {
      const pid = line.slice(9).trim();
      if (pid) this.activePids.delete(pid);
      this.updateState(this.activePids.size > 0 ? "active" : "inactive");
    }
  }

  private updateState(state: MicState): void {
    if (state !== this.currentState) {
      this.currentState = state;
      this.options.onStateChange?.(state);
    }
  }

  private scheduleRestart(): void {
    this.restartTimer = setTimeout(() => {
      if (!this.destroyed) {
        this.start();
      }
    }, 5000);
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    this.destroyed = true;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.process) {
      try {
        this.process.kill("SIGTERM");
      } catch {
        // Process may already be dead
      }
      this.process = null;
    }
  }
}
