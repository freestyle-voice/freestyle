/**
 * Soft start/success chimes that mirror the desktop pill tones (F4 / C4 sine
 * blips). Gated by the device-only `soundFeedback` preference; callers still
 * fire haptics independently.
 *
 * Players are created lazily and reused so repeated dictations don't pay the
 * asset-load cost each time. Callers own enabling/disabling via
 * `setSoundFeedbackEnabled`.
 */

import { type AudioPlayer, createAudioPlayer } from "expo-audio";

import startWav from "@/assets/sounds/start.wav";
import successWav from "@/assets/sounds/success.wav";

let enabled = true;
let startPlayer: AudioPlayer | null = null;
let successPlayer: AudioPlayer | null = null;

/** Mirror the Settings toggle into the module so play helpers stay sync-cheap. */
export function setSoundFeedbackEnabled(next: boolean): void {
  enabled = next;
}

function ensurePlayer(
  existing: AudioPlayer | null,
  source: number,
): AudioPlayer {
  if (existing) return existing;
  // Keep volume modest — these sit under speech, not over it.
  const player = createAudioPlayer(source, { updateInterval: 500 });
  player.volume = 0.35;
  return player;
}

async function play(player: AudioPlayer): Promise<void> {
  try {
    // Restart from the top so a second tap mid-chime still sounds clean.
    await player.seekTo(0);
    player.play();
  } catch {
    // Chimes are best-effort — never break dictation if audio fails.
  }
}

/** Soft "start recording" blip. Safe to fire before the mic session opens. */
export async function playStartChime(): Promise<void> {
  if (!enabled) return;
  startPlayer = ensurePlayer(startPlayer, startWav);
  await play(startPlayer);
}

/** Soft "transcript ready" blip. Fire after the final arrives. */
export async function playSuccessChime(): Promise<void> {
  if (!enabled) return;
  successPlayer = ensurePlayer(successPlayer, successWav);
  await play(successPlayer);
}
