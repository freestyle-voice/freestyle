/**
 * Shared recording orchestration for the dictation screens.
 *
 * Owns the mic permission flow, the cloud streaming session lifecycle, and the
 * hold-vs-tap gesture handling so the main voice screen and the keyboard-handoff
 * screen behave identically. Callers supply what to do with the final
 * transcript (accumulate on screen vs. hand to the keyboard) and, for the
 * keyboard flow, whether to auto-start on mount.
 */

import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import type { MicState } from "@/components/mic-button";
import { authHeaders } from "@/lib/cloud/session";
import { CloudStreamSession } from "@/lib/cloud/stream";
import {
  applyDictionaryReplacements,
  useEntries,
  vocabularyTerms,
} from "@/lib/entries";
import { useHistory } from "@/lib/history";
import { languageHint, tonesForCloud, useSettings } from "@/lib/settings";
import {
  checkMicPermission,
  requestMicPermission,
  useRecorder,
} from "./recorder";

/** Debounce so an accidental tap/hold doesn't open a pointless session. */
const MIN_RECORDING_MS = 350;
/**
 * Hold threshold: pressing longer than this and releasing = hold-to-talk (stop
 * on release). A quick tap = toggle (stop on the next tap).
 */
const HOLD_THRESHOLD_MS = 300;

interface UseDictationOptions {
  signedIn: boolean;
  /** Called with the trimmed final transcript (non-empty). */
  onFinal: (text: string) => void;
  /** Reset any prior result when a new recording begins. */
  onRecordingStart?: () => void;
  /** Auto-start recording once on mount (keyboard-handoff flow). */
  autoStart?: boolean;
}

export interface Dictation {
  micState: MicState;
  partial: string;
  level: ReturnType<typeof useSharedValue<number>>;
  /** Press-and-hold / tap-to-toggle handlers for the mic button. */
  onPressIn: () => void;
  onPressOut: () => void;
  /** Plain tap-to-toggle (used by the keyboard-handoff screen). */
  toggle: () => void;
}

export function useDictation({
  signedIn,
  onFinal,
  onRecordingStart,
  autoStart = false,
}: UseDictationOptions): Dictation {
  const { settings } = useSettings();
  const { vocabulary, dictionary } = useEntries();
  const { addHistory } = useHistory();

  const [micState, setMicState] = useState<MicState>("idle");
  const [partial, setPartial] = useState("");
  // Mic level as a shared value so the mic button + waveform animate on the UI
  // thread (smooth) rather than re-rendering React on every audio buffer.
  const level = useSharedValue(0);

  const sessionRef = useRef<CloudStreamSession | null>(null);
  const startedAt = useRef(0);
  // Recording length captured at commit time, read back when the final arrives
  // so the saved history entry records how long the dictation actually was.
  const committedDurationRef = useRef(0);
  const recordingRef = useRef(false);
  // Set synchronously on press-in so a rapid double-tap can't kick off two
  // recordings before the async permission check flips `recordingRef`.
  const startingRef = useRef(false);
  // Timestamp of the last press-in, used to tell a hold (stop on release) from
  // a quick tap (toggle: stop on the next tap).
  const pressInAt = useRef(0);

  // Keep the latest onFinal without re-creating beginRecording each render.
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  });
  const onStartRef = useRef(onRecordingStart);
  useEffect(() => {
    onStartRef.current = onRecordingStart;
  });
  // Keep the latest addHistory so saving doesn't rebuild beginRecording.
  const addHistoryRef = useRef(addHistory);
  useEffect(() => {
    addHistoryRef.current = addHistory;
  });

  const recorder = useRecorder({
    onFrame: (frame) => sessionRef.current?.sendAudio(frame),
    onLevel: (v) => {
      level.value = v;
    },
  });

  const teardownSession = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
  }, []);

  useEffect(() => teardownSession, [teardownSession]);

  const beginRecording = useCallback(async () => {
    if (recordingRef.current || startingRef.current || !signedIn) return;
    const headers = authHeaders();
    if (!headers) return;
    startingRef.current = true;

    const perm =
      (await checkMicPermission()) === "granted"
        ? "granted"
        : await requestMicPermission();
    if (perm !== "granted") {
      startingRef.current = false;
      Alert.alert(
        "Microphone needed",
        "Enable microphone access in Settings to dictate.",
      );
      return;
    }

    recordingRef.current = true;
    startingRef.current = false;
    startedAt.current = Date.now();
    setPartial("");
    onStartRef.current?.();
    setMicState("recording");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    sessionRef.current = new CloudStreamSession({
      cookie: headers.Cookie,
      language: languageHint(settings.language),
      vocabulary: vocabularyTerms(vocabulary),
      cleanup: {
        skipPostProcess: !settings.cleanup,
        intensity: settings.intensity,
        customPrompt: settings.customPrompt || undefined,
        ...tonesForCloud(settings),
      },
      callbacks: {
        onReady: () => {},
        onPartial: (t) => setPartial(t),
        onFinal: (t) => {
          setPartial("");
          setMicState("idle");
          teardownSession();
          // Dictionary replacement runs locally on the final transcript, after
          // the cloud's cleanup — mirroring the desktop. Entries never leave
          // the device.
          const text = applyDictionaryReplacements(t.trim(), dictionary).trim();
          if (text) {
            // Persist to local history before handing off to the caller.
            addHistoryRef.current(text, committedDurationRef.current);
            onFinalRef.current(text);
          }
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        },
        onError: (message, code) => {
          setMicState("idle");
          teardownSession();
          if (code === "usage_exceeded") {
            Alert.alert(
              "Out of credits",
              "You've used your free Freestyle credits for now.",
            );
          } else {
            Alert.alert("Transcription failed", message);
          }
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Error,
          );
        },
        onClose: () => {
          // If the socket drops while we're still waiting on the final
          // transcript, don't leave the UI stuck in "finalizing".
          setMicState((s) => (s === "finalizing" ? "idle" : s));
        },
      },
    });

    try {
      await recorder.start();
    } catch {
      recordingRef.current = false;
      startingRef.current = false;
      setMicState("idle");
      teardownSession();
      Alert.alert("Recording failed", "Could not start the microphone.");
    }
  }, [recorder, settings, vocabulary, dictionary, teardownSession, signedIn]);

  const finishRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    level.value = 0;
    recorder.stop();

    const elapsed = Date.now() - startedAt.current;
    if (elapsed < MIN_RECORDING_MS) {
      teardownSession();
      setMicState("idle");
      return;
    }

    setMicState("finalizing");
    committedDurationRef.current = elapsed;
    sessionRef.current?.setAudioDurationMs(elapsed);
    sessionRef.current?.commit();
  }, [recorder, teardownSession, level]);

  const onPressIn = useCallback(() => {
    // A press while already recording is the second tap of a tap-to-toggle
    // interaction → stop.
    if (recordingRef.current) {
      finishRecording();
      return;
    }
    pressInAt.current = Date.now();
    void beginRecording();
  }, [beginRecording, finishRecording]);

  const onPressOut = useCallback(() => {
    if (!recordingRef.current) return;
    // Long enough to count as a hold → finish on release. Otherwise it was a
    // tap: leave recording running until the next tap.
    if (Date.now() - pressInAt.current >= HOLD_THRESHOLD_MS) {
      finishRecording();
    }
  }, [finishRecording]);

  const toggle = useCallback(() => {
    if (recordingRef.current) finishRecording();
    else void beginRecording();
  }, [beginRecording, finishRecording]);

  // Auto-start recording as soon as the screen opens (keyboard-handoff flow).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current || !signedIn) return;
    autoStarted.current = true;
    void beginRecording();
  }, [autoStart, beginRecording, signedIn]);

  return { micState, partial, level, onPressIn, onPressOut, toggle };
}
