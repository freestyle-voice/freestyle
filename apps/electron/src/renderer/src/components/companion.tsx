import "../overlay.css";

import { Spark, sparkScaleFor } from "@renderer/components/spark";
import { initApiBase } from "@renderer/lib/api";
import { DictationController } from "@renderer/lib/dictation";
import { installGlobalErrorHandlers } from "@renderer/lib/report-error";
import { SPRITES } from "@renderer/sprites/registry";
import { SpriteStage } from "@renderer/sprites/stage";
import {
  COMPANION_WINDOW_SIZE,
  type CompanionForm,
  type CompanionState,
  DEFAULT_COMPANION_FORM,
} from "@shared/companion";
import type { DictationPrefs } from "@shared/dictation-prefs";
import { SPRITES_INFO } from "@shared/sprites";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

const SPARK_HOT_RECT = SPRITES_INFO.spark.body;

export interface BubbleState {
  phase: "recording" | "transcribing" | "error";
  partial: string;
}

const ERROR_BUBBLE_MS = 4000;

function useDictation(
  setState: (s: CompanionState) => void,
  setListening: (v: boolean) => void,
  levelRef: React.RefObject<HTMLSpanElement | null>,
  setBubble: (b: BubbleState | null) => void,
  bubbleLevelRef: React.RefObject<HTMLDivElement | null>,
  busyRef: React.RefObject<boolean>,
): void {
  useEffect(() => {
    let prefs: DictationPrefs = {
      destination: "cursor",
      outputMode: "paste",
      soundEnabled: true,
      audioPlaybackMode: "off",
      micDeviceId: null,
    };
    let talkSession = false;
    let errorTimer: ReturnType<typeof setTimeout> | null = null;

    const showError = (message: string): void => {
      if (errorTimer) clearTimeout(errorTimer);
      setBubble({ phase: "error", partial: message });
      errorTimer = setTimeout(() => {
        errorTimer = null;
        setBubble(null);
      }, ERROR_BUBBLE_MS);
    };

    const controller = new DictationController(
      {
        onPhase: (phase) => {
          window.api.setDictationPhase(phase);
          busyRef.current = phase !== "idle";
          setState(phase === "idle" ? "idle" : "working");
          setListening(phase === "recording");
          if (phase !== "idle") {
            if (errorTimer) clearTimeout(errorTimer);
            errorTimer = null;
            setBubble({ phase, partial: "" });
          } else if (!errorTimer) {
            setBubble(null);
          }
        },
        onLevel: (level) => {
          levelRef.current?.style.setProperty(
            "--spark-scale",
            sparkScaleFor(level).toFixed(3),
          );
          bubbleLevelRef.current?.style.setProperty(
            "--bubble-level",
            Math.max(0.14, Math.min(1, level * 2.2)).toFixed(3),
          );
        },
        onPartial: (text) => {
          setBubble({ phase: "recording", partial: text });
          if (talkSession || prefs.destination === "composer")
            window.api.panelDictationPartial(text);
        },
        onComposerText: (text) => {
          talkSession = false;
          window.api.panelOpenForDictation();
          window.api.panelDictationFinal(text);
        },
        onError: (message) => {
          talkSession = false;
          showError(message);
          window.api.panelDictationError(message);
        },
      },
      {
        destination: () => (talkSession ? "composer" : prefs.destination),
        outputMode: () => prefs.outputMode,
        soundEnabled: () => prefs.soundEnabled,
        audioPlaybackMode: () => prefs.audioPlaybackMode,
        micDeviceId: () => prefs.micDeviceId,
      },
    );

    void window.api
      .dictationPrefs()
      .then((next) => {
        prefs = next;
      })
      .catch(() => {});

    const offPrefs = window.api.onDictationPrefs((next) => {
      prefs = next;
    });
    const offDown = window.api.onHotkeyDown(() => {
      // Key-repeat on the held key re-fires this; a live session must not be
      // restarted or demoted back to cursor mode mid-recording.
      if (controller.isActive()) return;
      talkSession = false;
      void controller.start();
    });
    const offUp = window.api.onHotkeyUp(() => controller.stop());
    const offCancel = window.api.onDictationCancel(() => {
      talkSession = false;
      controller.cancel();
    });
    const offTalkDown = window.api.onTalkDown(() => {
      // Fn+Control shares Fn with dictation, so the plain-dictation session
      // often starts first. PROMOTE it to a talk session rather than
      // cancel-and-restart — a restart leaves two STT sessions in flight,
      // and both finals deliver.
      talkSession = true;
      if (!controller.isActive()) void controller.start();
    });
    const offTalkUp = window.api.onTalkUp(() => controller.stop());
    const offServer = window.api.onServerChanged(() => {
      void controller.reconnectServer();
    });
    return () => {
      offServer?.();
      if (errorTimer) clearTimeout(errorTimer);
      offPrefs?.();
      offDown?.();
      offUp?.();
      offCancel?.();
      offTalkDown?.();
      offTalkUp?.();
      controller.destroy();
    };
  }, [setState, setListening, levelRef, setBubble, bubbleLevelRef, busyRef]);
}

const BUBBLE_BARS = [0.6, 1, 0.7];

function SparkBubble({
  bubble,
  levelHostRef,
}: {
  bubble: BubbleState;
  levelHostRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  const recording = bubble.phase === "recording";
  const text = bubble.partial.trim()
    ? bubble.partial.length > 220
      ? `…${bubble.partial.slice(-220)}`
      : bubble.partial
    : recording
      ? "Listening"
      : "…";
  return (
    <div className="bubble" ref={levelHostRef}>
      <div
        className={`bubble-chip${bubble.phase === "error" ? " is-error" : ""}`}
      >
        <div className="bubble-bars">
          {BUBBLE_BARS.map((weight, i) => (
            <span
              key={`b-${weight}-${i}`}
              className={`bubble-bar${recording ? "" : " is-paused"}`}
              style={
                recording
                  ? {
                      transform: `scaleY(calc(var(--bubble-level, 0.2) * ${weight}))`,
                    }
                  : undefined
              }
            />
          ))}
        </div>
        <span className="bubble-text">{text}</span>
      </div>
    </div>
  );
}

function SparkStage({
  state,
  listening,
  levelRef,
  bubble,
  bubbleLevelRef,
}: {
  state: CompanionState;
  listening: boolean;
  levelRef: React.RefObject<HTMLSpanElement | null>;
  bubble: BubbleState | null;
  bubbleLevelRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  useEffect(() => {
    window.api.companionSetHotRect(SPARK_HOT_RECT);
  }, []);

  return (
    <div
      style={{
        width: COMPANION_WINDOW_SIZE,
        height: COMPANION_WINDOW_SIZE,
        position: "relative",
        background: "transparent",
      }}
    >
      <style>{`
        .spark-core,
        .spark-satellite {
          display: block;
          transform: rotate(45deg);
          transition: transform 260ms cubic-bezier(.2,.9,.25,1),
                      border-radius 260ms ease,
                      opacity 200ms ease;
        }
        .spark-core.is-working {
          transform: rotate(90deg);
          animation: spark-breathe 1.6s ease-in-out infinite;
        }
        .spark-core.is-listening {
          animation: none;
        }
        .spark-level {
          display: block;
          transform: scale(var(--spark-scale, 1));
          transition: transform 70ms linear;
        }
        @keyframes spark-breathe {
          0%, 100% { transform: rotate(90deg) scale(1); }
          50% { transform: rotate(90deg) scale(1.16); }
        }
        .bubble {
          position: absolute;
          left: ${SPARK_HOT_RECT.x - 6}px;
          bottom: ${COMPANION_WINDOW_SIZE - SPARK_HOT_RECT.y + 2}px;
          max-width: ${COMPANION_WINDOW_SIZE - SPARK_HOT_RECT.x - 4}px;
          display: flex;
          pointer-events: none;
          font-family: "Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif;
        }
        .bubble-chip {
          display: inline-flex;
          align-items: flex-end;
          gap: 6px;
          padding: 5px 10px 5px 8px;
          border-radius: 14px;
          background: rgba(251, 245, 228, 0.92);
          border: 1px solid rgba(219, 204, 166, 0.8);
          min-width: 0;
        }
        .bubble-bars {
          display: flex;
          align-items: center;
          gap: 2px;
          height: 11px;
          flex-shrink: 0;
          margin-bottom: 1.5px;
        }
        .bubble-bar {
          width: 2.5px;
          height: 11px;
          border-radius: 1.5px;
          background: #d98e2b;
          transform: scaleY(0.2);
          transform-origin: center;
          transition: transform 70ms linear;
        }
        .bubble-bar.is-paused {
          background: #8e7f5f;
        }
        .bubble-chip.is-error {
          background: rgba(251, 233, 231, 0.95);
          border-color: rgba(214, 120, 108, 0.8);
        }
        .bubble-chip.is-error .bubble-bar {
          background: #b42318;
        }
        .bubble-chip.is-error .bubble-text {
          color: #7a2016;
        }
        .bubble-text {
          font-size: 11px;
          line-height: 1.35;
          color: #8e7f5f;
          overflow-wrap: break-word;
          overflow: hidden;
          min-width: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .spark-core, .spark-satellite {
            transition: none !important;
            animation: none !important;
          }
          .spark-level {
            transform: none !important;
            transition: none !important;
          }
          .bubble-bar {
            transition: none !important;
          }
        }
      `}</style>
      {bubble ? (
        <SparkBubble bubble={bubble} levelHostRef={bubbleLevelRef} />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: SPARK_HOT_RECT.x,
          top: SPARK_HOT_RECT.y,
          width: SPARK_HOT_RECT.width,
          height: SPARK_HOT_RECT.height,
          display: "grid",
          placeItems: "center",
        }}
      >
        <Spark state={state} listening={listening} levelRef={levelRef} />
      </div>
    </div>
  );
}

function CompanionRoot(): React.JSX.Element | null {
  const [form, setForm] = useState<CompanionForm | null>(null);
  const [state, setState] = useState<CompanionState>("idle");
  const [listening, setListening] = useState(false);
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const levelRef = useRef<HTMLSpanElement>(null);
  const bubbleLevelRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  useDictation(
    setState,
    setListening,
    levelRef,
    setBubble,
    bubbleLevelRef,
    busyRef,
  );
  (window as unknown as Record<string, unknown>).__companionTest = {
    setBubble,
  };

  useEffect(() => {
    window.api
      .companionForm()
      .then(setForm)
      .catch(() => setForm(DEFAULT_COMPANION_FORM));
    const offForm = window.api.onCompanionForm((next) => setForm(next));
    const offState = window.api.onCompanionState((next) => {
      if (next === "idle" && busyRef.current) return;
      setState(next);
    });
    const offHot = window.api.onCompanionHotEnter(() => {
      window.api.companionHover();
    });
    return () => {
      offForm?.();
      offState?.();
      offHot?.();
    };
  }, []);

  if (!form) return null;
  const def = SPRITES[form];
  return def.kind === "sheet" ? (
    <SpriteStage def={def} state={state} bubble={bubble} />
  ) : (
    <SparkStage
      state={state}
      listening={listening}
      levelRef={levelRef}
      bubble={bubble}
      bubbleLevelRef={bubbleLevelRef}
    />
  );
}

initApiBase();
installGlobalErrorHandlers();

const container = document.getElementById("root");
if (container) createRoot(container).render(<CompanionRoot />);
