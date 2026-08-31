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
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const SPARK_HOT_RECT = SPRITES_INFO.spark.body;
const COMPANION_DOCK = { width: 38, height: 8, gap: 6 };

type Rect = { x: number; y: number; width: number; height: number };

function companionInteractionRect(body: Rect, windowSize: number): Rect {
  const dockTop = Math.min(
    windowSize - COMPANION_DOCK.height,
    body.y + body.height + COMPANION_DOCK.gap,
  );
  return {
    x: body.x,
    y: body.y,
    width: body.width,
    height: dockTop + COMPANION_DOCK.height - body.y,
  };
}

function CompanionDock({
  body,
  windowSize,
}: {
  body: Rect;
  windowSize: number;
}): React.JSX.Element {
  const top = Math.min(
    windowSize - COMPANION_DOCK.height,
    body.y + body.height + COMPANION_DOCK.gap,
  );
  const left = body.x + Math.round((body.width - COMPANION_DOCK.width) / 2);

  return (
    <div
      aria-label="Drag to reposition companion"
      data-companion-dock
      onMouseDown={() => {
        window.api.beginCompanionPositionDrag();
      }}
      role="img"
      style={
        {
          position: "absolute",
          left,
          top,
          width: COMPANION_DOCK.width,
          height: COMPANION_DOCK.height,
          borderRadius: 999,
          background: "rgba(10, 10, 10, 0.92)",
          border: "1px solid rgba(255, 255, 255, 0.22)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
          cursor: "grab",
          WebkitAppRegion: "drag",
        } as React.CSSProperties
      }
    />
  );
}

function SparkStage({
  state,
  hotRect,
}: {
  state: CompanionState;
  hotRect: Rect;
}): React.JSX.Element {
  useEffect(() => {
    window.api.companionSetHotRect(hotRect);
  }, [hotRect]);

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

  const def = form ? SPRITES[form] : null;
  const hotRect = useMemo(
    () =>
      companionInteractionRect(
        def?.body ?? SPARK_HOT_RECT,
        def?.windowSize ?? COMPANION_WINDOW_SIZE,
      ),
    [def],
  );
  if (!def) return null;
  return (
    <button
      aria-label="Open Remix workspace"
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-companion-dock]")
        ) {
          return;
        }
        window.api.openCompanionWorkspace();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        window.api.companionContextMenu();
      }}
      onMouseLeave={() => window.api.companionPointerLeft()}
      style={{
        position: "relative",
        width: def.windowSize,
        height: def.windowSize,
        display: "block",
        margin: 0,
        padding: 0,
        border: 0,
        background: "transparent",
        cursor: "pointer",
      }}
      type="button"
    >
      {def.kind === "sheet" ? (
        <SpriteStage def={def} hotRect={hotRect} state={state} />
      ) : (
        <SparkStage hotRect={hotRect} state={state} />
      )}
      <CompanionDock body={def.body} windowSize={def.windowSize} />
    </button>
  );
}

installGlobalErrorHandlers();

const container = document.getElementById("root");
if (container) createRoot(container).render(<CompanionRoot />);
