import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createAppLogger } from "@freestyle/utils";

const execFileAsync = promisify(execFile);
const log = createAppLogger("audio-ducking");

const MIN_DUCK_DELTA = 0.02;
const RESTORE_EPSILON = 0.08;
const DEFAULT_DUCK_LEVEL = 0;

type BackendKind = "windows" | "macos" | "linux-wpctl" | "linux-pactl";
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

export class AudioDucker {
  private snapshot: Snapshot | null = null;
  private backendPromise: Promise<BackendKind | null> | null = null;
  private queue = Promise.resolve();
  private depth = 0;

  duck(level = DEFAULT_DUCK_LEVEL): Promise<void> {
    return this.enqueue(async () => {
      this.depth += 1;
      if (this.snapshot) return;

      const kind = await this.getBackend();
      if (!kind) return;

      const state = await readVolumeState(kind);
      if (!state || state.muted) return;

      const desiredLevel = clamp01(level);
      const target = clamp01(state.volume * desiredLevel);
      const useMuteFallback =
        desiredLevel <= 0 || state.volume - target < MIN_DUCK_DELTA;

      if (useMuteFallback) {
        await setMuted(kind, true);
        this.snapshot = {
          kind,
          current: state.volume,
          muted: state.muted,
          target: null,
          strategy: "mute",
        };
        log.debug(`Applied mute fallback while ducking on ${kind}`);
        return;
      }

      await setVolume(kind, target);
      this.snapshot = {
        kind,
        current: state.volume,
        muted: state.muted,
        target,
        strategy: "volume",
      };
      log.debug(
        `Applied volume ducking on ${kind}: ${state.volume.toFixed(3)} -> ${target.toFixed(3)}`,
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

      const live = await readVolumeState(snapshot.kind).catch(() => null);
      const restorePlan = getRestorePlan(snapshot, live);
      if (!restorePlan.restoreVolume && !restorePlan.restoreMute) {
        log.debug(
          `Skipping restore on ${snapshot.kind} because audio state changed externally`,
        );
        return;
      }

      if (restorePlan.restoreVolume) {
        await setVolume(snapshot.kind, snapshot.current);
      }
      if (restorePlan.restoreMute) {
        await setMuted(snapshot.kind, snapshot.muted);
      }
      log.debug(`Restored audio after ducking on ${snapshot.kind}`);
    });
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(work).catch((error) => {
      log.debug(
        error instanceof Error ? error.message : String(error ?? "unknown"),
      );
    });
    return this.queue;
  }

  private getBackend(): Promise<BackendKind | null> {
    if (!this.backendPromise) {
      this.backendPromise = detectBackend();
    }
    return this.backendPromise;
  }
}

async function detectBackend(): Promise<BackendKind | null> {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  if (process.platform !== "linux") return null;

  const tool = await commandExists("wpctl")
    .then((ok) => (ok ? "linux-wpctl" : null))
    .then(
      async (kind) =>
        kind ?? ((await commandExists("pactl")) ? "linux-pactl" : null),
    );

  return tool;
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync("sh", ["-lc", `command -v ${command} >/dev/null 2>&1`]);
    return true;
  } catch {
    return false;
  }
}

async function readVolumeState(kind: BackendKind): Promise<VolumeState | null> {
  switch (kind) {
    case "windows":
      return readWindowsVolumeState();
    case "macos":
      return readMacVolumeState();
    case "linux-wpctl":
      return readWpctlVolumeState();
    case "linux-pactl":
      return readPactlVolumeState();
  }
}

async function setVolume(kind: BackendKind, value: number): Promise<void> {
  const clamped = clamp01(value);
  switch (kind) {
    case "windows":
      await setWindowsVolume(clamped);
      return;
    case "macos":
      await execFileAsync("osascript", [
        "-e",
        `set volume output volume ${Math.round(clamped * 100)}`,
      ]);
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

async function setMuted(kind: BackendKind, muted: boolean): Promise<void> {
  switch (kind) {
    case "windows":
      await setWindowsMuted(muted);
      return;
    case "macos":
      await execFileAsync("osascript", [
        "-e",
        muted
          ? "set volume with output muted"
          : "set volume without output muted",
      ]);
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
