/**
 * Soft start/success chimes that mirror the desktop pill tones (F4 / C4 sine
 * blips). Gated by the device-only `soundFeedback` preference; callers still
 * fire haptics independently.
 *
 * `useAudioPlayer` owns and releases the native players with the calling hook.
 * The start helper only waits for the known audio duration. Waiting for the
 * native player's initial seek can take noticeably longer on a cold app and
 * must never delay the microphone or streaming connection.
 */

import { type AudioPlayer, useAudioPlayer } from "expo-audio";
import { useCallback, useEffect } from "react";

import startWav from "@/assets/sounds/start.wav";
import successWav from "@/assets/sounds/success.wav";

const CHIME_DURATION_MS = 150;

function play(player: AudioPlayer): void {
  // Best-effort playback deliberately stays off the critical recording path.
  // On a cold start `seekTo` may wait for the audio asset to hydrate.
  void player
    .seekTo(0)
    .then(() => player.play())
    .catch(() => {});
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
    play(startPlayer);
    // Keep the chime out of the first forwarded speech frames without waiting
    // for an unpredictable native player round-trip.
    await new Promise((resolve) => setTimeout(resolve, CHIME_DURATION_MS));
  }, [enabled, startPlayer]);

  const playSuccessChime = useCallback(async () => {
    if (!enabled) return;
    play(successPlayer);
  }, [enabled, successPlayer]);

  return { playStartChime, playSuccessChime };
}
