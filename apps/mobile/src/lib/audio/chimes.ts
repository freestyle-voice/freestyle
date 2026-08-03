/**
 * Soft start/success chimes that mirror the desktop pill tones (F4 / C4 sine
 * blips). Gated by the device-only `soundFeedback` preference; callers still
 * fire haptics independently.
 *
 * `useAudioPlayer` owns and releases the native players with the calling hook.
 * The start helper resolves after the short asset has finished so callers can
 * keep those frames out of the microphone stream.
 */

import { type AudioPlayer, useAudioPlayer } from "expo-audio";
import { useCallback, useEffect } from "react";

import startWav from "@/assets/sounds/start.wav";
import successWav from "@/assets/sounds/success.wav";

const CHIME_DURATION_MS = 150;

async function play(player: AudioPlayer, waitForEnd: boolean): Promise<void> {
  try {
    // Restart from the top so a second tap mid-chime still sounds clean.
    await player.seekTo(0);
    player.play();
    if (waitForEnd) {
      await new Promise((resolve) => setTimeout(resolve, CHIME_DURATION_MS));
    }
  } catch {
    // Chimes are best-effort — never break dictation if audio fails.
  }
}

export function useChimes(enabled: boolean): {
  playStartChime: () => Promise<void>;
  playSuccessChime: () => Promise<void>;
} {
  const startPlayer = useAudioPlayer(startWav, { updateInterval: 500 });
  const successPlayer = useAudioPlayer(successWav, { updateInterval: 500 });

  useEffect(() => {
    // Keep volume modest — these sit under speech, not over it.
    startPlayer.volume = 0.35;
    successPlayer.volume = 0.35;
  }, [startPlayer, successPlayer]);

  const playStartChime = useCallback(async () => {
    if (!enabled) return;
    await play(startPlayer, true);
  }, [enabled, startPlayer]);

  const playSuccessChime = useCallback(async () => {
    if (!enabled) return;
    await play(successPlayer, false);
  }, [enabled, successPlayer]);

  return { playStartChime, playSuccessChime };
}
