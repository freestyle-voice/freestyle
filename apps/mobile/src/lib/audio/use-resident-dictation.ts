/**
 * Resident dictation session for the keyboard hand-off flow.
 *
 * Unlike `useDictation` (the simple hold/tap recorder used on the Home screen),
 * this keeps a *warm* microphone stream alive across many phrases so the user
 * never has to leave the keyboard again once the session is armed:
 *
 *   • `arm()`      — acquire the mic once and start the audio stream. From here
 *                    on the OS mic indicator stays lit until `disarm()`. While
 *                    "armed but idle" we simply *drop* the captured frames
 *                    instead of forwarding them, so no cloud session runs and no
 *                    audio leaves the device.
 *   • `beginCapture()` — open a cloud streaming session and start forwarding the
 *                    already-flowing frames. Instant: the mic is already open.
 *   • `commit()`   — finish the phrase, ask the cloud for the final transcript,
 *                    then return to "armed" (mic still warm) for the next phrase.
 *   • `cancel()`   — abandon the current phrase, stay armed.
 *   • `disarm()`   — stop the stream and release the mic (indicator goes off).
 *
 * This is the piece that makes "tap the keyboard mic again → it just records"
 * work without another trip through the app: after a commit we stay armed, so a
 * subsequent `beginCapture` needs no permission prompt, no foreground wait, and
 * no `getUserMedia` round-trip.
 *
 * Why a separate hook from `useDictation`? The two have fundamentally different
 * lifecycles — `useDictation` acquires+releases the mic per phrase; this holds
 * it across phrases. Forcing both into one hook made the state machine
 * ambiguous (that ambiguity is exactly what produced the "mic already on but
 * I still have to go back to the app" gap).
 */

import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useSharedValue } from "react-native-reanimated";

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

/** Ignore commits for phrases shorter than this (accidental taps). */
const MIN_CAPTURE_MS = 350;

/** Callbacks the session owner (the bridge) supplies to react to progress. */
export interface ResidentDictationCallbacks {
  /** The mic is warm and idle, ready for a phrase. */
  onArmed?: () => void;
  /** A phrase started capturing. */
  onCaptureStart?: () => void;
  /** Live partial transcript during capture. */
  onPartial?: (text: string) => void;
  /** Phrase committed; waiting on the cloud final. */
  onFinalizing?: () => void;
  /** A non-empty, cleaned final transcript is ready. */
  onFinal?: (text: string) => void;
  /**
   * Something failed. `recoverable` is true when the *session* is still armed
   * (a single phrase failed) vs. false when arming itself failed.
   */
  onError?: (message: string, recoverable: boolean) => void;
  /** The session was fully disarmed (mic released). */
  onDisarmed?: () => void;
}

export interface ResidentDictation {
  /** Mic input level [0,1] as a reanimated shared value (waveform/meter). */
  level: ReturnType<typeof useSharedValue<number>>;
  /** Acquire the mic and hold it warm. Optionally begin the first phrase. */
  arm: (options?: { beginImmediately?: boolean }) => Promise<void>;
  /** Start forwarding audio to a fresh cloud session (must be armed). */
  beginCapture: () => void;
  /** Finish the current phrase and request the final transcript. */
  commit: () => void;
  /** Abandon the current phrase but stay armed. */
  cancel: () => void;
  /** Release the mic entirely. */
  disarm: () => void;
}

type Internal = "idle" | "arming" | "armed" | "capturing" | "finalizing";

export function useResidentDictation(
  callbacks: ResidentDictationCallbacks,
): ResidentDictation {
  const { settings } = useSettings();
  const { vocabulary, dictionary } = useEntries();
  const { addHistory } = useHistory();

  const level = useSharedValue(0);

  // The warm cloud session for the *current* phrase (null while armed-idle).
  const sessionRef = useRef<CloudStreamSession | null>(null);
  // True once the mic stream is running (survives across phrases).
  const streamOnRef = useRef(false);
  // Internal state machine, kept in a ref so callbacks read it synchronously.
  const stateRef = useRef<Internal>("idle");
  const captureStartedAt = useRef(0);
  const capturedMsRef = useRef(0);

  // Latest callbacks + data, without rebuilding the stable command methods.
  const cbRef = useRef(callbacks);
  useEffect(() => {
    cbRef.current = callbacks;
  });
  const addHistoryRef = useRef(addHistory);
  useEffect(() => {
    addHistoryRef.current = addHistory;
  });
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });
  const vocabularyRef = useRef(vocabulary);
  useEffect(() => {
    vocabularyRef.current = vocabulary;
  });
  const dictionaryRef = useRef(dictionary);
  useEffect(() => {
    dictionaryRef.current = dictionary;
  });

  // The recorder streams continuously while armed. We only *forward* frames to
  // the cloud when a phrase is actively capturing — otherwise they're dropped,
  // so armed-but-idle time never leaves the device or bills the user.
  const recorder = useRecorder({
    onFrame: (frame) => {
      if (stateRef.current === "capturing")
        sessionRef.current?.sendAudio(frame);
    },
    onLevel: (v) => {
      // Zero the meter when idle so the UI doesn't jitter from room noise.
      level.value = stateRef.current === "capturing" ? v : 0;
    },
  });

  const closeSession = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
  }, []);

  const openSession = useCallback((): CloudStreamSession | null => {
    const headers = authHeaders();
    if (!headers) return null;
    const s = settingsRef.current;
    return new CloudStreamSession({
      cookie: headers.Cookie,
      language: languageHint(s.language),
      vocabulary: vocabularyTerms(vocabularyRef.current),
      cleanup: {
        skipPostProcess: !s.cleanup,
        intensity: s.intensity,
        customPrompt: s.customPrompt || undefined,
        ...tonesForCloud(s),
      },
      callbacks: {
        onReady: () => {},
        onPartial: (t) => {
          if (stateRef.current === "capturing") cbRef.current.onPartial?.(t);
        },
        onFinal: (t) => {
          closeSession();
          const text = applyDictionaryReplacements(
            t.trim(),
            dictionaryRef.current,
          ).trim();
          // Internally we're armed again (mic stays warm), but we do NOT fire
          // onArmed here: the owner needs to publish a `ready` state carrying
          // the transcript first, and the keyboard must read+insert it before
          // we overwrite it with `armed`. The owner re-arms on ackInsert (or a
          // fallback timer). If the text is empty there's nothing to insert, so
          // go straight back to armed.
          if (text) {
            addHistoryRef.current(text, capturedMsRef.current);
            // Stay in a terminal "finalizing" internally until the owner moves
            // us on; expose the text via onFinal.
            stateRef.current = streamOnRef.current ? "armed" : "idle";
            cbRef.current.onFinal?.(text);
            void Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
          } else {
            stateRef.current = streamOnRef.current ? "armed" : "idle";
            if (stateRef.current === "armed") cbRef.current.onArmed?.();
          }
        },
        onError: (message, code) => {
          closeSession();
          const friendly =
            code === "usage_exceeded"
              ? "You've used your free Freestyle credits for now."
              : message;
          // A phrase failed but the mic is still warm → recoverable, stay armed.
          const recoverable = streamOnRef.current;
          stateRef.current = recoverable ? "armed" : "idle";
          cbRef.current.onError?.(friendly, recoverable);
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Error,
          );
        },
        onClose: () => {
          // Socket dropped mid-finalize: don't strand the caller in finalizing.
          if (stateRef.current === "finalizing") {
            stateRef.current = streamOnRef.current ? "armed" : "idle";
            if (stateRef.current === "armed") cbRef.current.onArmed?.();
          }
        },
      },
    });
  }, [closeSession]);

  const beginCapture = useCallback(() => {
    if (!streamOnRef.current) return;
    if (stateRef.current !== "armed") return;
    const session = openSession();
    if (!session) {
      cbRef.current.onError?.("Not signed in.", true);
      return;
    }
    sessionRef.current = session;
    captureStartedAt.current = Date.now();
    stateRef.current = "capturing";
    cbRef.current.onCaptureStart?.();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [openSession]);

  const arm = useCallback(
    async (options?: { beginImmediately?: boolean }) => {
      if (stateRef.current !== "idle") {
        // Already armed/capturing. If asked to begin and we're idle-armed, do so.
        if (options?.beginImmediately && stateRef.current === "armed") {
          beginCapture();
        }
        return;
      }
      if (!authHeaders()) {
        cbRef.current.onError?.("Not signed in.", false);
        return;
      }

      stateRef.current = "arming";

      const perm =
        (await checkMicPermission()) === "granted"
          ? "granted"
          : await requestMicPermission();
      if (perm !== "granted") {
        stateRef.current = "idle";
        cbRef.current.onError?.("Microphone access is off.", false);
        return;
      }

      // iOS won't activate a recording session unless the app is foreground.
      // The keyboard deep-links us in, so wait until the scene is truly active.
      if (AppState.currentState !== "active") {
        await waitForActive();
      }
      // A disarm may have raced in while we awaited.
      if (stateRef.current !== "arming") return;

      try {
        await recorder.start();
      } catch {
        stateRef.current = "idle";
        cbRef.current.onError?.("Couldn't start the microphone.", false);
        return;
      }

      streamOnRef.current = true;
      stateRef.current = "armed";
      cbRef.current.onArmed?.();

      if (options?.beginImmediately) beginCapture();
    },
    [recorder, beginCapture],
  );

  const commit = useCallback(() => {
    if (stateRef.current !== "capturing") return;
    const elapsed = Date.now() - captureStartedAt.current;
    if (elapsed < MIN_CAPTURE_MS) {
      // Too short to be a real phrase — drop it, stay armed.
      closeSession();
      stateRef.current = streamOnRef.current ? "armed" : "idle";
      if (stateRef.current === "armed") cbRef.current.onArmed?.();
      return;
    }
    capturedMsRef.current = elapsed;
    stateRef.current = "finalizing";
    level.value = 0;
    cbRef.current.onFinalizing?.();
    sessionRef.current?.setAudioDurationMs(elapsed);
    sessionRef.current?.commit();
  }, [closeSession, level]);

  const cancel = useCallback(() => {
    if (stateRef.current !== "capturing") return;
    closeSession();
    stateRef.current = streamOnRef.current ? "armed" : "idle";
    level.value = 0;
    if (stateRef.current === "armed") cbRef.current.onArmed?.();
  }, [closeSession, level]);

  const disarm = useCallback(() => {
    closeSession();
    if (streamOnRef.current) recorder.stop();
    streamOnRef.current = false;
    stateRef.current = "idle";
    level.value = 0;
    cbRef.current.onDisarmed?.();
  }, [closeSession, recorder, level]);

  // Always release the mic on unmount so we never leave the indicator lit.
  useEffect(() => disarm, [disarm]);

  return { level, arm, beginCapture, commit, cancel, disarm };
}

/**
 * Resolve once the app is foreground-active (or after a short timeout so a
 * stuck/edge state can't hang arming forever).
 */
function waitForActive(timeoutMs = 4_000): Promise<void> {
  if (AppState.currentState === "active") return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sub.remove();
      resolve();
    };
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") done();
    });
    const timer = setTimeout(done, timeoutMs);
  });
}
