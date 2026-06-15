/**
 * Pause background media while dictating on Linux.
 *
 * 1. MPRIS pause via D-Bus (busctl) — Spotify, browser media, VLC, etc.
 * 2. Optional playerctl when installed
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createAppLogger } from "@freestyle/utils";

const log = createAppLogger("linux-media-playback");
const execFileAsync = promisify(execFile);

const CMD_TIMEOUT_MS = 3000;
const MPRIS_PREFIX = "org.mpris.MediaPlayer2.";
const MPRIS_PATH = "/org/mpris/MediaPlayer2";
const MPRIS_PLAYER = "org.mpris.MediaPlayer2.Player";

let pausedMprisServices: string[] = [];

async function runCmd(
  command: string,
  args: string[],
): Promise<{ stdout: string; ok: boolean }> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      timeout: CMD_TIMEOUT_MS,
    });
    return { stdout: stdout.trim(), ok: true };
  } catch {
    return { stdout: "", ok: false };
  }
}

async function commandExists(command: string): Promise<boolean> {
  const { ok } = await runCmd("sh", ["-c", `command -v ${command}`]);
  return ok;
}

// ---------------------------------------------------------------------------
// D-Bus MPRIS (busctl)
// ---------------------------------------------------------------------------

async function listMprisServices(): Promise<string[]> {
  const { stdout, ok } = await runCmd("busctl", ["--user", "list"]);
  if (!ok || !stdout) return [];

  const services: string[] = [];
  for (const line of stdout.split("\n")) {
    const service = line.split(/\s+/)[0];
    if (service?.startsWith(MPRIS_PREFIX)) {
      services.push(service);
    }
  }
  return services;
}

function parseDBusString(stdout: string): string {
  const match = stdout.match(/"([^"]*)"/);
  return match?.[1] ?? "";
}

async function getMprisStatus(service: string): Promise<string> {
  const { stdout } = await runCmd("busctl", [
    "--user",
    "get-property",
    service,
    MPRIS_PATH,
    MPRIS_PLAYER,
    "PlaybackStatus",
  ]);
  return parseDBusString(stdout);
}

async function mprisPause(service: string): Promise<boolean> {
  const { ok } = await runCmd("busctl", [
    "--user",
    "call",
    service,
    MPRIS_PATH,
    MPRIS_PLAYER,
    "Pause",
  ]);
  return ok;
}

async function mprisPlay(service: string): Promise<boolean> {
  const { ok } = await runCmd("busctl", [
    "--user",
    "call",
    service,
    MPRIS_PATH,
    MPRIS_PLAYER,
    "Play",
  ]);
  return ok;
}

async function pauseMprisViaDBus(): Promise<string[]> {
  const services = await listMprisServices();
  const paused: string[] = [];

  for (const service of services) {
    const status = await getMprisStatus(service);
    if (status === "Playing" && (await mprisPause(service))) {
      paused.push(service);
    }
  }

  return paused;
}

// ---------------------------------------------------------------------------
// playerctl (optional)
// ---------------------------------------------------------------------------

async function listPlayerctlPlayers(): Promise<string[]> {
  const { stdout, ok } = await runCmd("playerctl", ["--list-all"]);
  if (!ok || !stdout) return [];
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function pausePlayerctl(): Promise<string[]> {
  if (!(await commandExists("playerctl"))) return [];

  const players = await listPlayerctlPlayers();
  const paused: string[] = [];

  for (const player of players) {
    const { stdout } = await runCmd("playerctl", ["-p", player, "status"]);
    if (stdout === "Playing") {
      const { ok } = await runCmd("playerctl", ["-p", player, "pause"]);
      if (ok) paused.push(player);
    }
  }

  return paused;
}

async function playPlayerctl(player: string): Promise<void> {
  await runCmd("playerctl", ["-p", player, "play"]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pause MPRIS media sessions. Returns true if at least one player was paused.
 */
export async function pausePlayback(): Promise<boolean> {
  if (pausedMprisServices.length > 0) {
    await resumePlayback();
  }

  const dbusPaused = await pauseMprisViaDBus();
  const playerctlPaused = await pausePlayerctl();
  pausedMprisServices = [...new Set([...dbusPaused, ...playerctlPaused])];

  if (pausedMprisServices.length > 0) {
    log.info(`Paused ${pausedMprisServices.length} MPRIS target(s)`);
  }

  return pausedMprisServices.length > 0;
}

/**
 * Restore playback paused by {@link pausePlayback}.
 */
export async function resumePlayback(): Promise<void> {
  if (pausedMprisServices.length === 0) return;

  for (const target of pausedMprisServices) {
    if (target.startsWith(MPRIS_PREFIX)) {
      await mprisPlay(target);
    } else {
      await playPlayerctl(target);
    }
  }

  log.info(`Resumed ${pausedMprisServices.length} MPRIS target(s)`);

  pausedMprisServices = [];
}
