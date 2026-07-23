/**
 * Drives the resident keyboard-dictation session from the app side.
 *
 * The iOS keyboard extension can't use the mic, so when the user taps the mic
 * on the keyboard it opens the app once and then commands it over the App Group.
 * This hook is the app's half of that protocol. It runs from an always-mounted
 * provider (see `KeyboardDictationProvider`) so the session survives no matter
 * which screen is on top — the whole point is that after the first hand-off the
 * user never has to come back to the app.
 *
 *   • Observes keyboard commands (`start`, `beginCapture`, `commit`,
 *     `cancelCapture`, `disarm`, `ackInsert`) via the `onCommand` event plus a
 *     poll fallback (Darwin notifications can be missed while backgrounded).
 *   • Runs the actual recording/streaming through `useResidentDictation`, which
 *     keeps the mic warm between phrases so a subsequent `beginCapture` is
 *     instant and needs no return trip to the app.
 *   • Publishes a phase machine + partial/final transcript back to the keyboard
 *     so it can show live status and insert the result (guarded by an
 *     `insertionToken`), then stays "armed" for the next phrase.
 *   • Keeps a heartbeat alive so the keyboard knows the session is still warm.
 *
 * Command → session mapping (the fix for the "have to go back to the app" gap):
 *   - `start`        : arm the mic AND auto-begin the first phrase. The single
 *                      keyboard tap that launched the app is already recording
 *                      when the user switches back to their app.
 *   - `beginCapture` : begin a phrase in-place (mic already warm) — no app trip.
 *   - `commit`       : finish the phrase; we return to `armed`, mic still warm.
 *   - `cancelCapture`: abandon the phrase, stay armed.
 *   - `disarm`       : release the mic (ends the resident session).
 *
 * Everything is a no-op when the keyboard bridge is unavailable (Android / Expo
 * Go), so the provider is safe to mount unconditionally.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { useSharedValue } from "react-native-reanimated";

import { useResidentDictation } from "@/lib/audio/use-resident-dictation";
import {
  addCommandListener,
  clearCommand,
  isKeyboardBridgeAvailable,
  type KeyboardCommand,
  loadCommand,
  type Phase,
  resetState,
  touchHeartbeat,
  updateLevel,
  writeState,
} from "./dictation-bridge";

/** Ignore commands older than this — a leftover command must not replay when
 * the app is launched manually rather than from the keyboard. */
const COMMAND_MAX_AGE_MS = 12_000;
/** Heartbeat cadence; must stay well under the keyboard's 12s liveness window. */
const HEARTBEAT_MS = 3_000;

interface UseKeyboardDictationBridge {
  /** Whether the app is currently acting as the keyboard's voice server. */
  active: boolean;
  /** Current session phase, surfaced for the on-screen status strip. */
  phase: Phase;
  /** Live partial transcript while capturing. */
  partial: string;
  /** Latest final transcript handed to the keyboard. */
  finalText: string;
  /** Mic input level [0,1] as a reanimated shared value (waveform/mic UI). */
  level: ReturnType<typeof useSharedValue<number>>;
  /** On-screen mic tap: begin/commit capture, mirroring a keyboard mic tap. */
  toggle: () => void;
  /** Dismiss the on-screen session entirely: cancel any capture and release
   *  the mic (the user tapped the strip's close button). */
  dismiss: () => void;
}

export function useKeyboardDictationBridge(
  signedIn: boolean,
): UseKeyboardDictationBridge {
  const available = isKeyboardBridgeAvailable();

  const [phase, setPhase] = useState<Phase>("idle");
  const [partial, setPartial] = useState("");
  const [finalText, setFinalText] = useState("");

  const phaseRef = useRef<Phase>("idle");
  const sessionIdRef = useRef("");
  const lastHandledTokenRef = useRef("");
  // Latest partial, readable synchronously by callbacks (e.g. onFinalizing).
  const partialRef = useRef("");
  // The most recent ready transcript's insertion token, cleared on ack.
  const pendingInsertRef = useRef("");
  // Fallback timer that re-arms if the keyboard never acks a `ready` insert.
  const reArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to the mic-level shared value so `publish` can read the latest level.
  const levelRef = useRef<ReturnType<typeof useSharedValue<number>> | null>(
    null,
  );

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // --- Publish a full snapshot to the App Group for the keyboard.
  const publish = useCallback(
    (
      p: Phase,
      extra?: {
        partial?: string;
        finalTranscript?: string;
        insertionToken?: string;
        statusMessage?: string;
      },
    ) => {
      setPhaseBoth(p);
      writeState({
        phase: p,
        sessionID: sessionIdRef.current,
        partialTranscript: extra?.partial ?? "",
        finalTranscript: extra?.finalTranscript ?? "",
        insertionToken: extra?.insertionToken ?? "",
        statusMessage: extra?.statusMessage ?? "",
        level: p === "capturing" ? (levelRef.current?.value ?? 0) : 0,
      });
    },
    [setPhaseBoth],
  );

  // --- The resident (warm-mic) recording session.
  const session = useResidentDictation({
    onArmed: () => {
      setPartial("");
      publish("armed");
    },
    onCaptureStart: () => {
      setPartial("");
      publish("capturing", { partial: "" });
    },
    onPartial: (t) => {
      setPartial(t);
      partialRef.current = t;
      if (phaseRef.current === "capturing")
        publish("capturing", { partial: t });
    },
    onFinalizing: () => {
      publish("transcribing", { partial: partialRef.current });
    },
    onFinal: (text) => {
      setFinalText(text);
      const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingInsertRef.current = token;
      // Publish `ready` so the keyboard inserts the transcript exactly once
      // (guarded by insertionToken). We stay on `ready` until the keyboard acks
      // the insert, then re-arm for the next phrase. A fallback timer re-arms
      // even if the ack is missed (keyboard closed, notification dropped) so we
      // never get stuck showing "ready" with a warm-but-idle mic.
      publish("ready", { finalTranscript: text, insertionToken: token });
      if (reArmTimerRef.current) clearTimeout(reArmTimerRef.current);
      reArmTimerRef.current = setTimeout(() => {
        if (phaseRef.current === "ready") {
          pendingInsertRef.current = "";
          publish("armed");
        }
      }, 4_000);
    },
    onError: (message, recoverable) => {
      if (recoverable) {
        publish("armed", { statusMessage: message });
      } else {
        sessionIdRef.current = "";
        setPhaseBoth("failed");
        writeState({ phase: "failed", statusMessage: message });
      }
    },
    onDisarmed: () => {
      sessionIdRef.current = "";
      pendingInsertRef.current = "";
      setPhaseBoth("idle");
      resetState();
    },
  });
  levelRef.current = session.level;

  // --- Command handling.
  const handleCommand = useCallback(
    (command: KeyboardCommand) => {
      if (!command.token || command.token === lastHandledTokenRef.current) {
        return;
      }
      // Ignore stale commands (see COMMAND_MAX_AGE_MS).
      if (Date.now() - command.updatedAt * 1000 > COMMAND_MAX_AGE_MS) {
        return;
      }
      lastHandledTokenRef.current = command.token;
      clearCommand();

      switch (command.kind) {
        case "start":
          // Cold start from the keyboard: arm the mic AND begin the first
          // phrase, so the single tap that opened the app is already recording.
          if (!sessionIdRef.current) sessionIdRef.current = `${Date.now()}`;
          publish("arming");
          if (signedIn) void session.arm({ beginImmediately: true });
          break;
        case "beginCapture":
          // In-place begin: the mic is already warm, no app trip needed.
          if (phaseRef.current === "armed" || phaseRef.current === "ready") {
            session.beginCapture();
          } else if (
            phaseRef.current === "idle" ||
            phaseRef.current === "failed"
          ) {
            // Session lapsed (e.g. disarmed on memory pressure). Re-arm+begin.
            if (!sessionIdRef.current) sessionIdRef.current = `${Date.now()}`;
            publish("arming");
            if (signedIn) void session.arm({ beginImmediately: true });
          }
          break;
        case "commit":
          if (phaseRef.current === "capturing") session.commit();
          break;
        case "cancelCapture":
          if (phaseRef.current === "capturing") session.cancel();
          break;
        case "ackInsert":
          // Keyboard inserted the ready transcript → re-arm for the next phrase
          // (mic is still warm). Clear the fallback re-arm timer.
          if (
            command.ackInsertionToken === "" ||
            command.ackInsertionToken === pendingInsertRef.current
          ) {
            if (reArmTimerRef.current) {
              clearTimeout(reArmTimerRef.current);
              reArmTimerRef.current = null;
            }
            pendingInsertRef.current = "";
            if (phaseRef.current === "ready") publish("armed");
          }
          break;
        case "disarm":
          session.disarm();
          break;
      }
    },
    [session, publish, signedIn],
  );

  // --- On-screen mic tap (status strip): mirror a keyboard mic tap.
  const toggle = useCallback(() => {
    switch (phaseRef.current) {
      case "idle":
      case "failed":
        if (!sessionIdRef.current) sessionIdRef.current = `${Date.now()}`;
        publish("arming");
        if (signedIn) void session.arm({ beginImmediately: true });
        break;
      case "armed":
      case "ready":
        session.beginCapture();
        break;
      case "capturing":
        session.commit();
        break;
      case "arming":
      case "transcribing":
        break; // busy
    }
  }, [session, publish, signedIn]);

  // --- Dismiss the on-screen session: cancel any capture and release the mic.
  const dismiss = useCallback(() => {
    if (reArmTimerRef.current) {
      clearTimeout(reArmTimerRef.current);
      reArmTimerRef.current = null;
    }
    pendingInsertRef.current = "";
    session.disarm();
  }, [session]);

  // --- Forward the live mic level to the keyboard meter while capturing.
  useEffect(() => {
    if (!available || phase !== "capturing") return;
    const level = session.level;
    const timer = setInterval(() => {
      updateLevel(level.value);
    }, 66); // ~15 fps — smooth enough for a meter, cheap on the App Group.
    return () => clearInterval(timer);
  }, [available, phase, session.level]);

  // --- Wire up the command observer (event + poll fallback) and heartbeat.
  useEffect(() => {
    if (!available) return;

    // Drain any command already waiting (e.g. the `start` that launched us).
    const pending = loadCommand();
    if (pending) handleCommand(pending);

    const unsubscribe = addCommandListener(handleCommand);

    // Poll fallback: Darwin notifications can be dropped while the app is
    // backgrounded, so also sweep the channel on a timer + on foreground.
    const pollTimer = setInterval(() => {
      const command = loadCommand();
      if (command) handleCommand(command);
    }, 400);

    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        const command = loadCommand();
        if (command) handleCommand(command);
      }
    });

    return () => {
      unsubscribe();
      clearInterval(pollTimer);
      appStateSub.remove();
    };
  }, [available, handleCommand]);

  // --- Heartbeat while a session is live.
  useEffect(() => {
    if (!available) return;
    const timer = setInterval(() => {
      if (phaseRef.current !== "idle" && phaseRef.current !== "failed") {
        touchHeartbeat();
      }
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [available]);

  // --- Clear the fallback re-arm timer on unmount.
  useEffect(() => {
    return () => {
      if (reArmTimerRef.current) clearTimeout(reArmTimerRef.current);
    };
  }, []);

  return {
    active: available && phase !== "idle",
    phase,
    partial,
    finalText,
    level: session.level,
    toggle,
    dismiss,
  };
}
