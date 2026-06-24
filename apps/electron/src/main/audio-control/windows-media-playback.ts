/**
 * Pause background media while dictating on Windows.
 *
 * Uses the Windows Global System Media Transport Controls WinRT API through
 * PowerShell so we can pause and resume the exact media apps Freestyle changed.
 */

import { execFile, execFileSync } from "node:child_process";
import { createAppLogger } from "@freestyle-voice/utils";
import { AUDIO_CONTROL_CMD_TIMEOUT_MS } from "./audio-control-constants";

const log = createAppLogger("windows-media-playback");

let pausedSourceAppUserModelIds: string[] = [];

const MEDIA_CONTROL_SCRIPT = `
& {
param([string]$Action, [string]$SourceIdsJson)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskOperationMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {
    $_.Name -eq "AsTask" -and
    $_.IsGenericMethodDefinition -and
    $_.GetGenericArguments().Count -eq 1 -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.FullName -like "Windows.Foundation.IAsyncOperation*"
  } |
  Select-Object -First 1

function Await-Operation {
  param([object]$Operation, [type]$ResultType)
  $task = $asTaskOperationMethod.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

function Write-Result {
  param([bool]$Changed, [string[]]$SourceIds)
  [ordered]@{
    changed = $Changed
    sourceAppUserModelIds = @($SourceIds | Where-Object { $_ } | Select-Object -Unique)
  } | ConvertTo-Json -Compress
}

$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$statusType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus, Windows.Media.Control, ContentType=WindowsRuntime]
$manager = Await-Operation ($managerType::RequestAsync()) $managerType
$sessions = @($manager.GetSessions())

if ($Action -eq "pause") {
  $paused = @()
  foreach ($session in $sessions) {
    $info = $session.GetPlaybackInfo()
    if ($info -and $info.PlaybackStatus -eq $statusType::Playing) {
      $ok = Await-Operation ($session.TryPauseAsync()) ([bool])
      if ($ok) {
        $paused += [string]$session.SourceAppUserModelId
      }
    }
  }
  Write-Result ($paused.Count -gt 0) $paused
  exit 0
}

if ($Action -eq "resume") {
  $sourceIds = @()
  if ($SourceIdsJson) {
    $parsed = ConvertFrom-Json $SourceIdsJson
    if ($parsed -is [array]) {
      $sourceIds = @($parsed)
    } elseif ($null -ne $parsed) {
      $sourceIds = @($parsed)
    }
  }

  if ($sourceIds.Count -eq 0) {
    Write-Result $false @()
    exit 0
  }

  $resumed = @()
  foreach ($session in $sessions) {
    $sourceId = [string]$session.SourceAppUserModelId
    if ($sourceIds -notcontains $sourceId) {
      continue
    }

    $info = $session.GetPlaybackInfo()
    if ($info -and $info.PlaybackStatus -eq $statusType::Playing) {
      continue
    }

    $ok = Await-Operation ($session.TryPlayAsync()) ([bool])
    if ($ok) {
      $resumed += $sourceId
    }
  }
  Write-Result ($resumed.Count -gt 0) $resumed
  exit 0
}

throw "usage: pause | resume"
}
`;

interface MediaControlResponse {
  changed?: unknown;
  sourceAppUserModelIds?: unknown;
}

function mediaControlArgs(
  action: "pause" | "resume",
  sourceAppUserModelIds: string[] = [],
): string[] {
  return [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    MEDIA_CONTROL_SCRIPT,
    action,
    JSON.stringify(sourceAppUserModelIds),
  ];
}

function runMediaControl(
  action: "pause" | "resume",
  sourceAppUserModelIds: string[] = [],
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      mediaControlArgs(action, sourceAppUserModelIds),
      { encoding: "utf8", timeout: AUDIO_CONTROL_CMD_TIMEOUT_MS },
      (err, stdout, stderr) => {
        if (err) {
          const detail = typeof stderr === "string" ? stderr.trim() : "";
          reject(new Error(detail || err.message));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

function runMediaControlSync(
  action: "pause" | "resume",
  sourceAppUserModelIds: string[] = [],
): string {
  return execFileSync(
    "powershell.exe",
    mediaControlArgs(action, sourceAppUserModelIds),
    { encoding: "utf8", timeout: AUDIO_CONTROL_CMD_TIMEOUT_MS },
  ).trim();
}

function parseSourceIds(stdout: string): string[] {
  const data = JSON.parse(stdout) as MediaControlResponse;
  if (data.changed !== true) return [];

  const sourceIds = Array.isArray(data.sourceAppUserModelIds)
    ? data.sourceAppUserModelIds
    : typeof data.sourceAppUserModelIds === "string"
      ? [data.sourceAppUserModelIds]
      : [];

  return [
    ...new Set(
      sourceIds.filter((value): value is string => typeof value === "string"),
    ),
  ];
}

/**
 * Pause playing Windows media sessions. Returns true if at least one player was paused.
 */
export async function pausePlayback(): Promise<boolean> {
  if (process.platform !== "win32") return false;

  if (pausedSourceAppUserModelIds.length > 0) {
    await resumePlayback();
  }

  try {
    pausedSourceAppUserModelIds = parseSourceIds(
      await runMediaControl("pause"),
    );
  } catch {
    pausedSourceAppUserModelIds = [];
    return false;
  }

  if (pausedSourceAppUserModelIds.length > 0) {
    log.info(
      `Paused ${pausedSourceAppUserModelIds.length} Windows media target(s)`,
    );
  }

  return pausedSourceAppUserModelIds.length > 0;
}

/**
 * Restore playback paused by {@link pausePlayback}.
 */
export async function resumePlayback(): Promise<void> {
  if (process.platform !== "win32") return;
  if (pausedSourceAppUserModelIds.length === 0) return;

  const sourceIds = pausedSourceAppUserModelIds;
  pausedSourceAppUserModelIds = [];

  try {
    await runMediaControl("resume", sourceIds);
    log.info(`Resumed ${sourceIds.length} Windows media target(s)`);
  } catch {
    log.warn("resume_playback failed");
  }
}

export function resumePlaybackSync(): void {
  if (process.platform !== "win32") return;
  if (pausedSourceAppUserModelIds.length === 0) return;

  const sourceIds = pausedSourceAppUserModelIds;
  pausedSourceAppUserModelIds = [];

  try {
    runMediaControlSync("resume", sourceIds);
    log.info(`Resumed ${sourceIds.length} Windows media target(s)`);
  } catch {
    // Quit cleanup should never block app shutdown on media restore failure.
  }
}
