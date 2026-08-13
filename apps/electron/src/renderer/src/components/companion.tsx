import "../overlay.css";

import { Spark, sparkScaleFor } from "@renderer/components/spark";
import { initApiBase } from "@renderer/lib/api";
import {
  DictationController,
  type DictationDestination,
} from "@renderer/lib/dictation";
import { installGlobalErrorHandlers } from "@renderer/lib/report-error";
import { SPRITES } from "@renderer/sprites/registry";
import { SpriteStage } from "@renderer/sprites/stage";
import {
  COMPANION_WINDOW_SIZE,
  type CompanionForm,
  type CompanionState,
  DEFAULT_COMPANION_FORM,
} from "@shared/companion";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

const SPARK_HOT_RECT = { x: 18, y: 190, width: 52, height: 52 };

export interface BubbleState {
  phase: "recording" | "transcribing";
  partial: string;
}

function useDictation(
  setState: (s: CompanionState) => void,
  setListening: (v: boolean) => void,
  levelRef: React.RefObject<HTMLSpanElement | null>,
  setBubble: (b: BubbleState | null) => void,
  bubbleLevelRef: React.RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    let destination: DictationDestination = "cursor";
    let outputMode: "paste" | "clipboard" = "paste";
    let soundEnabled = true;
    let audioPlaybackMode: "off" | "duck" | "pause" = "off";
    let talkSession = false;

    const controller = new DictationController(
      {
        onPhase: (phase) => {
          setState(phase === "idle" ? "idle" : "working");
          setListening(phase === "recording");
          if (phase === "idle") {
            setBubble(null);
          } else {
            setBubble({ phase, partial: "" });
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
          if (talkSession || destination === "composer")
            window.api.panelDictationPartial(text);
        },
        onComposerText: (text) => {
          talkSession = false;
          window.api.panelOpenForDictation();
          window.api.panelDictationFinal(text);
        },
        onError: (message) => {
          talkSession = false;
          window.api.panelDictationError(message);
        },
      },
      {
        destination: () => (talkSession ? "composer" : destination),
        outputMode: () => outputMode,
        soundEnabled: () => soundEnabled,
        audioPlaybackMode: () => audioPlaybackMode,
      },
    );

    void window.api
      .dictationPrefs()
      .then((prefs) => {
        destination = prefs.destination;
        outputMode = prefs.outputMode;
        soundEnabled = prefs.soundEnabled;
        audioPlaybackMode = prefs.audioPlaybackMode;
      })
      .catch(() => {});

    const offPrefs = window.api.onDictationPrefs((prefs) => {
      destination = prefs.destination;
      outputMode = prefs.outputMode;
      soundEnabled = prefs.soundEnabled;
      audioPlaybackMode = prefs.audioPlaybackMode;
    });
    const offDown = window.api.onHotkeyDown(() => {
      // Key-repeat on the held key re-fires this; a live session must not be
      // restarted or demoted back to cursor mode mid-recording.
      if (controller.isActive()) return;
      talkSession = false;
      void controller.start();
    });
    const offUp = window.api.onHotkeyUp(() => controller.stop());
    const offTalkDown = window.api.onTalkDown(() => {
      // Fn+Control shares Fn with dictation, so the plain-dictation session
      // often starts first. PROMOTE it to a talk session rather than
      // cancel-and-restart — a restart leaves two STT sessions in flight,
      // and both finals deliver.
      talkSession = true;
      if (!controller.isActive()) void controller.start();
    });
    const offTalkUp = window.api.onTalkUp(() => controller.stop());
    return () => {
      offPrefs?.();
      offDown?.();
      offUp?.();
      offTalkDown?.();
      offTalkUp?.();
      controller.destroy();
    };
  }, [setState, setListening, levelRef, setBubble, bubbleLevelRef]);
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
      <div className="bubble-chip">
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

  useDictation(setState, setListening, levelRef, setBubble, bubbleLevelRef);
  (window as unknown as Record<string, unknown>).__companionTest = {
    setBubble,
  };

  useEffect(() => {
    window.api
      .companionForm()
      .then(setForm)
      .catch(() => setForm(DEFAULT_COMPANION_FORM));
    const offForm = window.api.onCompanionForm((next) => setForm(next));
    const offState = window.api.onCompanionState((next) => setState(next));
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
