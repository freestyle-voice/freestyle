import "../overlay.css";

import { Spark } from "@renderer/components/spark";
import { installGlobalErrorHandlers } from "@renderer/lib/report-error";
import { SPRITES } from "@renderer/sprites/registry";
import { SpriteStage } from "@renderer/sprites/stage";
import {
  COMPANION_WINDOW_SIZE,
  type CompanionForm,
  type CompanionState,
  DEFAULT_COMPANION_FORM,
} from "@shared/companion";
import { SPRITES_INFO } from "@shared/sprites";
import type React from "react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const SPARK_HOT_RECT = SPRITES_INFO.spark.body;

function SparkStage({ state }: { state: CompanionState }): React.JSX.Element {
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
        @keyframes spark-breathe {
          0%, 100% { transform: rotate(90deg) scale(1); }
          50% { transform: rotate(90deg) scale(1.16); }
        }
        @media (prefers-reduced-motion: reduce) {
          .spark-core, .spark-satellite { transition: none !important; animation: none !important; }
        }
      `}</style>
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
        <Spark state={state} />
      </div>
    </div>
  );
}

function CompanionRoot(): React.JSX.Element | null {
  const [form, setForm] = useState<CompanionForm | null>(null);
  const [state, setState] = useState<CompanionState>("idle");

  useEffect(() => {
    window.api
      .companionForm()
      .then(setForm)
      .catch(() => setForm(DEFAULT_COMPANION_FORM));
    const offForm = window.api.onCompanionForm(setForm);
    const offState = window.api.onCompanionState(setState);
    return () => {
      offForm?.();
      offState?.();
    };
  }, []);

  if (!form) return null;
  const def = SPRITES[form];
  return def.kind === "sheet" ? (
    <SpriteStage def={def} state={state} />
  ) : (
    <SparkStage state={state} />
  );
}

installGlobalErrorHandlers();

const container = document.getElementById("root");
if (container) createRoot(container).render(<CompanionRoot />);
