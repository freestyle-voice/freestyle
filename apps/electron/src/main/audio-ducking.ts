import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { createAppLogger } from "@freestyle/utils";
import { getNativeBinaryPath } from "./native-binary";

const execFileAsync = promisify(execFile);
const log = createAppLogger("audio-ducking");

const MIN_DUCK_DELTA = 0.02;
const RESTORE_EPSILON = 0.08;
const DEFAULT_DUCK_LEVEL = 0;

const NATIVE_COMMAND_TIMEOUT_MS = 500;
const NATIVE_STARTUP_TIMEOUT_MS = 2000;
const NATIVE_KILL_TIMEOUT_MS = 500;

type BackendKind = "windows-native" | "windows" | "macos" | "linux-wpctl" | "linux-pactl";
type DuckStrategy = "volume" | "mute";

interface Snapshot {
  kind: BackendKind;
  current: number;
  muted: boolean;
  target: number | null;
  strategy: DuckStrategy;
}

interface VolumeState {
  volume: number;
  muted: boolean;
}

interface RestorePlan {
  restoreVolume: boolean;
  restoreMute: boolean;
}

interface PendingRequest {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Context needed to execute a backend operation. On Windows this may carry a
 * live native controller; on other platforms it is just the backend kind.
 */
interface BackendContext {
  kind: BackendKind;
  native?: NativeWindowsVolumeController;
}

/**
 * Low-latency Windows volume controller backed by a native helper.
 *
 * The helper opens the default playback endpoint's IAudioEndpointVolume once
 * and keeps it warm. Commands are sent over stdin; responses are read from
 * stdout. If the helper fails to start, crashes, hangs, or misbehaves, callers
 * can fall back to the slower PowerShell-based implementation.
 *
 * Safety features:
 *  - startup timeout
 *  - per-command timeout
 *  - automatic cleanup on dispose / crash / EOF
 *  - explicit kill with graceful window then SIGTERM
 *  - stderr logging
 */
class NativeWindowsVolumeController {
  private process: ChildProcessWithoutNullStreams | null = null;
  private pending: PendingRequest | null = null;
  private buffer = "";
  private ready = false;
  private disposed = false;

  constructor(private readonly binaryPath: string) {}

  /**
   * Start the helper process. Returns true if it printed "ready", false
   * otherwise. Subsequent calls are no-ops if already started.
   */
  async start(): Promise<boolean> {
    if (this.process) return this.ready;
    if (this.disposed) return false;

    log.debug(`Starting native Windows volume helper: ${this.binaryPath}`);

    return new Promise((resolve) => {
      const startupTimer = setTimeout(() => {
        log.error("Native volume helper startup timed out");
        this.dispose();
        resolve(false);
      }, NATIVE_STARTUP_TIMEOUT_MS);

      try {
        this.process = spawn(this.binaryPath, [], {
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (err) {
        clearTimeout(startupTimer);
        log.error(`Failed to spawn native volume helper: ${String(err)}`);
        resolve(false);
        return;
      }

      if (!this.process?.stdin || !this.process?.stdout || !this.process?.stderr) {
        clearTimeout(startupTimer);
        log.error("Native volume helper has no stdio pipes");
        this.dispose();
        resolve(false);
        return;
      }

      this.process.stdout.setEncoding("utf8");
      this.process.stdout.on("data", (chunk: string) => this.onData(chunk));
      this.process.on("error", (err) => {
        log.error(`Native volume helper process error: ${err.message}`);
        this.onProcessExit();
      });
      this.process.on("exit", () => this.onProcessExit());
      this.process.on("close", () => this.onProcessExit());
      this.process.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8").trim();
        if (text) log.debug(`Native volume helper stderr: ${text}`);
      });

      const onFirstLines = (chunk: string) => {
        this.buffer += chunk;
        const lines = this.buffer.split(/\r?\n/);
        this.buffer = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;

          if (line === "ready") {
            clearTimeout(startupTimer);
            this.ready = true;
            // Replace one-time handler with normal handler.
            this.process?.stdout.off("data", onFirstLines);
            this.process?.stdout.on("data", (c: string) => this.onData(c));
            resolve(true);
            return;
          }

          if (line.startsWith("err|")) {
            clearTimeout(startupTimer);
            log.error(`Native volume helper failed to initialize: ${line}`);
            this.dispose();
            resolve(false);
            return;
          }
        }
      };

      this.process.stdout.on("data", onFirstLines);
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      this.handleResponse(line);
    }
  }

  private handleResponse(line: string): void {
    const pending = this.pending;
    if (!pending) {
      log.debug(`Unexpected response from native volume helper: ${line}`);
      return;
    }
    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve(line);
  }

  private onProcessExit(): void {
    if (!this.process) return;
    log.debug("Native volume helper process exited");
    const wasPending = this.pending;
    this.pending = null;
    this.process = null;
    this.ready = false;
    if (wasPending) {
      clearTimeout(wasPending.timer);
      wasPending.reject(new Error("Native volume helper exited unexpectedly"));
    }
  }

  /**
   * Send a command and wait for a single-line response. Throws on timeout,
   * process error, or non-ok response where applicable.
   */
  async request(command: string, timeoutMs = NATIVE_COMMAND_TIMEOUT_MS): Promise<string> {
    if (this.disposed) throw new Error("Native volume helper is disposed");
    if (!this.ready || !this.process?.stdin) {
      throw new Error("Native volume helper not ready");
    }
    if (this.pending) {
      throw new Error("Native volume helper already has a pending request");
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        log.error(`Native volume helper command timed out: ${command}`);
        this.dispose();
        reject(new Error(`Native volume helper command timed out: ${command}`));
      }, timeoutMs);

      this.pending = { resolve, reject, timer };
      this.process!.stdin.write(`${command}\n`, (err) => {
        if (err) {
          this.pending = null;
          clearTimeout(timer);
          log.error(`Failed to write to native volume helper: ${err.message}`);
          this.dispose();
          reject(err);
        }
      });
    });
  }

  async getVolumeState(): Promise<VolumeState | null> {
    const line = await this.request("get");
    return parsePipeVolumeState(line);
  }

  async setVolume(value: number): Promise<void> {
    const response = await this.request(`set ${clamp01(value).toFixed(4)}`);
    if (response !== "ok") {
      throw new Error(`set volume failed: ${response}`);
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    const response = await this.request(`mute ${muted ? "1" : "0"}`);
    if (response !== "ok") {
      throw new Error(`set mute failed: ${response}`);
    }
  }

  /**
   * Kill the helper process and clean up. Idempotent.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    const proc = this.process;
    const wasPending = this.pending;

    this.process = null;
    this.pending = null;
    this.ready = false;

    if (wasPending) {
      clearTimeout(wasPending.timer);
      wasPending.reject(new Error("Native volume helper disposed"));
    }

    if (!proc) return;

    try {
      if (!proc.stdin.destroyed) {
        proc.stdin.end();
      }
    } catch {
      // ignore
    }

    const killTimer = setTimeout(() => {
      try {
        if (!proc.killed) {
          proc.kill("SIGTERM");
        }
      } catch {
        // ignore
      }
    }, NATIVE_KILL_TIMEOUT_MS);

    proc.on("exit", () => clearTimeout(killTimer));
    proc.on("close", () => clearTimeout(killTimer));

    if (proc.exitCode !== null) {
      clearTimeout(killTimer);
    }
  }
}

export class AudioDucker {
  private snapshot: Snapshot | null = null;
  private backendPromise: Promise<BackendContext | null> | null = null;
  private queue = Promise.resolve();
  private depth = 0;
  private nativeController: NativeWindowsVolumeController | null = null;

  duck(level = DEFAULT_DUCK_LEVEL): Promise<void> {
    return this.enqueue(async () => {
      this.depth += 1;
      if (this.snapshot) return;

      const ctx = await this.getBackend();
      if (!ctx) return;

      const state = await readVolumeState(ctx);
      if (!state || state.muted) return;

      const desiredLevel = clamp01(level);
      const target = clamp01(state.volume * desiredLevel);
      const useMuteFallback =
        desiredLevel <= 0 || state.volume - target < MIN_DUCK_DELTA;

      if (useMuteFallback) {
        await setMuted(ctx, true);
        this.snapshot = {
          kind: ctx.kind,
          current: state.volume,
          muted: state.muted,
          target: null,
          strategy: "mute",
        };
        log.debug(`Applied mute fallback while ducking on ${ctx.kind}`);
        return;
      }

      await setVolume(ctx, target);
      this.snapshot = {
        kind: ctx.kind,
        current: state.volume,
        muted: state.muted,
        target,
        strategy: "volume",
      };
      log.debug(
        `Applied volume ducking on ${ctx.kind}: ${state.volume.toFixed(3)} -> ${target.toFixed(3)}`,
      );
    });
  }

  restore(): Promise<void> {
    return this.enqueue(async () => {
      if (this.depth > 0) {
        this.depth -= 1;
      }
      if (this.depth > 0) return;

      const snapshot = this.snapshot;
      this.snapshot = null;
      if (!snapshot) return;

      // If we have a live native controller, use it for restore; otherwise
      // reconstruct a minimal context from the snapshot kind.
      const ctx: BackendContext | null = this.nativeController
        ? { kind: snapshot.kind, native: this.nativeController }
        : await this.getBackend().catch(() => null);

      if (!ctx) return;

      const live = await readVolumeState(ctx).catch(() => null);
      const restorePlan = getRestorePlan(snapshot, live);
      if (!restorePlan.restoreVolume && !restorePlan.restoreMute) {
        log.debug(
          `Skipping restore on ${snapshot.kind} because audio state changed externally`,
        );
        return;
      }

      if (restorePlan.restoreVolume) {
        await setVolume(ctx, snapshot.current);
      }
      if (restorePlan.restoreMute) {
        await setMuted(ctx, snapshot.muted);
      }
      log.debug(`Restored audio after ducking on ${snapshot.kind}`);
    });
  }

  /**
   * Dispose the native helper (if any). Call this when the app is quitting.
   */
  dispose(): void {
    this.nativeController?.dispose();
    this.nativeController = null;
    this.backendPromise = null;
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(work).catch((error) => {
      log.debug(
        error instanceof Error ? error.message : String(error ?? "unknown"),
      );
    });
    return this.queue;
  }

  private getBackend(): Promise<BackendContext | null> {
    if (!this.backendPromise) {
      this.backendPromise = detectBackend(this);
    }
    return this.backendPromise;
  }
}

async function detectBackend(ducker: AudioDucker): Promise<BackendContext | null> {
  if (process.platform === "win32") {
    const nativePath = getNativeBinaryPath("windows-volume-control");
    if (nativePath) {
      const controller = new NativeWindowsVolumeController(nativePath);
      ducker["nativeController"] = controller;
      const ok = await controller.start();
      if (ok) {
        log.debug("Using native Windows volume control helper");
        return { kind: "windows-native", native: controller };
      }
      log.debug("Native Windows volume helper unavailable, falling back to PowerShell");
      controller.dispose();
      ducker["nativeController"] = null;
    }
    return { kind: "windows" };
  }
  if (process.platform === "darwin") return { kind: "macos" };
  if (process.platform !== "linux") return null;

  const tool = await commandExists("wpctl")
    .then((ok) => (ok ? "linux-wpctl" : null))
    .then(
      async (kind) =>
        kind ?? ((await commandExists("pactl")) ? "linux-pactl" : null),
    );

  return tool ? { kind: tool } : null;
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync("sh", ["-lc", `command -v ${command} >/dev/null 2>&1`]);
    return true;
  } catch {
    return false;
  }
}

async function readVolumeState(ctx: BackendContext): Promise<VolumeState | null> {
  switch (ctx.kind) {
    case "windows-native":
      return ctx.native!.getVolumeState();
    case "windows":
      return readWindowsVolumeState();
    case "macos":
      return readMacVolumeState();
    case "linux-wpctl":
      return readWpctlVolumeState();
    case "linux-pactl":
      return readPactlVolumeState();
    default:
      return null;
  }
}

async function setVolume(ctx: BackendContext, value: number): Promise<void> {
  const clamped = clamp01(value);
  switch (ctx.kind) {
    case "windows-native":
      await ctx.native!.setVolume(clamped);
      return;
    case "windows":
      await setWindowsVolume(clamped);
      return;
    case "macos":
      await setMacVolume(clamped);
      return;
    case "linux-wpctl":
      await execFileAsync("wpctl", [
        "set-volume",
        "@DEFAULT_AUDIO_SINK@",
        clamped.toFixed(3),
      ]);
      return;
    case "linux-pactl":
      await execFileAsync("pactl", [
        "set-sink-volume",
        "@DEFAULT_SINK@",
        `${Math.round(clamped * 100)}%`,
      ]);
      return;
  }
}

async function setMuted(ctx: BackendContext, muted: boolean): Promise<void> {
  switch (ctx.kind) {
    case "windows-native":
      await ctx.native!.setMuted(muted);
      return;
    case "windows":
      await setWindowsMuted(muted);
      return;
    case "macos":
      await setMacMuted(muted);
      return;
    case "linux-wpctl":
      await execFileAsync("wpctl", [
        "set-mute",
        "@DEFAULT_AUDIO_SINK@",
        muted ? "1" : "0",
      ]);
      return;
    case "linux-pactl":
      await execFileAsync("pactl", [
        "set-sink-mute",
        "@DEFAULT_SINK@",
        muted ? "1" : "0",
      ]);
      return;
  }
}

function getRestorePlan(
  snapshot: Snapshot,
  live: VolumeState | null,
): RestorePlan {
  if (!live) {
    return { restoreVolume: true, restoreMute: true };
  }

  if (snapshot.strategy === "mute") {
    if (!live.muted) {
      return { restoreVolume: false, restoreMute: false };
    }

    return {
      restoreVolume:
        Math.abs(live.volume - snapshot.current) <= RESTORE_EPSILON,
      restoreMute: true,
    };
  }

  if (snapshot.target === null || live.muted) {
    return { restoreVolume: false, restoreMute: false };
  }

  const stillDucked =
    Math.abs(live.volume - snapshot.target) <= RESTORE_EPSILON;

  return {
    restoreVolume: stillDucked,
    restoreMute: stillDucked,
  };
}

const WINDOWS_VOLUME_TYPE = `
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out uint pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    int GetMute(out bool pbMute);
    int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    int VolumeStepUp(Guid pguidEventContext);
    int VolumeStepDown(Guid pguidEventContext);
    int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, IntPtr ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.Interface)] out IAudioEndpointVolume ppInterface);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject {}

public static class FreestyleAudioEndpointVolume {
    private static IAudioEndpointVolume Open() {
        var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
        IMMDevice device;
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
        var iid = typeof(IAudioEndpointVolume).GUID;
        IAudioEndpointVolume endpoint;
        Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out endpoint));
        return endpoint;
    }

    public static float GetVolumeScalar() {
        float volume;
        Marshal.ThrowExceptionForHR(Open().GetMasterVolumeLevelScalar(out volume));
        return volume;
    }

    public static bool GetMute() {
        bool muted;
        Marshal.ThrowExceptionForHR(Open().GetMute(out muted));
        return muted;
    }

    public static void SetMute(bool muted) {
        Marshal.ThrowExceptionForHR(Open().SetMute(muted, Guid.Empty));
    }

    public static void SetVolumeScalar(float value) {
        Marshal.ThrowExceptionForHR(Open().SetMasterVolumeLevelScalar(value, Guid.Empty));
    }
}
`;

function encodePowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function buildWindowsVolumeScript(body: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -TypeDefinition @"',
    WINDOWS_VOLUME_TYPE.trim(),
    '"@',
    body.trim(),
  ].join("\n");
}

async function execWindowsPowerShell(script: string): Promise<string> {
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encodePowerShell(script),
  ]);
  return stdout.trim();
}

function parseWindowsVolumeState(stdout: string): VolumeState | null {
  const line = stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.includes("|"));
  if (!line) return null;

  const [volumeRaw, mutedRaw] = line.split("|", 2);
  const volume = Number.parseFloat(volumeRaw);
  if (!Number.isFinite(volume)) return null;

  return {
    volume: clamp01(volume),
    muted: mutedRaw?.toLowerCase() === "true",
  };
}

async function readWindowsVolumeState(): Promise<VolumeState | null> {
  const stdout = await execWindowsPowerShell(
    buildWindowsVolumeScript(`
[float]$volume = [FreestyleAudioEndpointVolume]::GetVolumeScalar()
[bool]$muted = [FreestyleAudioEndpointVolume]::GetMute()
Write-Output ("$volume|$muted")
    `),
  );

  return parseWindowsVolumeState(stdout);
}

async function setWindowsVolume(value: number): Promise<void> {
  await execWindowsPowerShell(
    buildWindowsVolumeScript(`
[FreestyleAudioEndpointVolume]::SetVolumeScalar([float]${clamp01(value)})
    `),
  );
}

async function setWindowsMuted(muted: boolean): Promise<void> {
  await execWindowsPowerShell(
    buildWindowsVolumeScript(`
[FreestyleAudioEndpointVolume]::SetMute(${muted ? "$true" : "$false"})
    `),
  );
}

async function readMacVolumeState(): Promise<VolumeState | null> {
  const nativePath = getNativeBinaryPath("macos-volume-control");
  if (nativePath) {
    try {
      const { stdout } = await execFileAsync(nativePath, ["get"]);
      return parsePipeVolumeState(stdout);
    } catch (err) {
      log.debug(
        `macOS native volume read failed, falling back to AppleScript: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  const [{ stdout: volumeRaw }, { stdout: mutedRaw }] = await Promise.all([
    execFileAsync("osascript", [
      "-e",
      "output volume of (get volume settings)",
    ]),
    execFileAsync("osascript", ["-e", "output muted of (get volume settings)"]),
  ]);

  const volume = Number.parseFloat(volumeRaw.trim());
  if (!Number.isFinite(volume)) return null;

  return {
    volume: clamp01(volume / 100),
    muted: mutedRaw.trim().toLowerCase() === "true",
  };
}

async function setMacVolume(value: number): Promise<void> {
  const nativePath = getNativeBinaryPath("macos-volume-control");
  if (nativePath) {
    try {
      await execFileAsync(nativePath, ["set", clamp01(value).toFixed(4)]);
      return;
    } catch (err) {
      log.debug(
        `macOS native volume set failed, falling back to AppleScript: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  await execFileAsync("osascript", [
    "-e",
    `set volume output volume ${Math.round(clamp01(value) * 100)}`,
  ]);
}

async function setMacMuted(muted: boolean): Promise<void> {
  const nativePath = getNativeBinaryPath("macos-volume-control");
  if (nativePath) {
    try {
      await execFileAsync(nativePath, [muted ? "mute" : "unmute"]);
      return;
    } catch (err) {
      log.debug(
        `macOS native mute set failed, falling back to AppleScript: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  await execFileAsync("osascript", [
    "-e",
    muted
      ? "set volume with output muted"
      : "set volume without output muted",
  ]);
}

function parsePipeVolumeState(stdout: string): VolumeState | null {
  const line = stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.includes("|"));
  if (!line) return null;

  const [volumeRaw, mutedRaw] = line.split("|", 2);
  const volume = Number.parseFloat(volumeRaw);
  if (!Number.isFinite(volume)) return null;

  return {
    volume: clamp01(volume),
    muted: mutedRaw?.toLowerCase() === "true",
  };
}

async function readWpctlVolumeState(): Promise<VolumeState | null> {
  const { stdout } = await execFileAsync("wpctl", [
    "get-volume",
    "@DEFAULT_AUDIO_SINK@",
  ]);
  const match = stdout.match(/([0-9]*\.?[0-9]+)/);
  if (!match) return null;

  return {
    volume: clamp01(Number.parseFloat(match[1])),
    muted: /\bmuted\b/i.test(stdout),
  };
}

async function readPactlVolumeState(): Promise<VolumeState | null> {
  const [{ stdout: volumeRaw }, { stdout: mutedRaw }] = await Promise.all([
    execFileAsync("pactl", ["get-sink-volume", "@DEFAULT_SINK@"]),
    execFileAsync("pactl", ["get-sink-mute", "@DEFAULT_SINK@"]),
  ]);
  const match = volumeRaw.match(/(\d+)%/);
  if (!match) return null;

  return {
    volume: clamp01(Number.parseInt(match[1], 10) / 100),
    muted: /\byes\b/i.test(mutedRaw),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}
