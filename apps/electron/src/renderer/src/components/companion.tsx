import "../overlay.css";

import { Spark } from "@renderer/components/spark";
import { installGlobalErrorHandlers } from "@renderer/lib/report-error";
import { SPRITES } from "@renderer/sprites/registry";
import { SpriteStage } from "@renderer/sprites/stage";
import {
  COMPANION_DOCK,
  COMPANION_WINDOW_SIZE,
  type CompanionFacing,
  type CompanionForm,
  type CompanionState,
  type CompanionStatus,
  DEFAULT_COMPANION_FORM,
} from "@shared/companion";
import { SPRITES_INFO } from "@shared/sprites";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const SPARK_HOT_RECT = SPRITES_INFO.spark.body;
type Rect = { x: number; y: number; width: number; height: number };
// The visible dock stays deliberately slim; this is the forgiving area that
// receives the native drag gesture around it.
const COMPANION_DOCK_HIT_TARGET = { width: 44, height: 22 } as const;

/** Mirror DOM geometry with the sheet canvas when a companion faces left. */
function companionRectForFacing(
  rect: Rect,
  windowSize: number,
  facing: CompanionFacing,
): Rect {
  if (facing === "right") return rect;
  return { ...rect, x: windowSize - rect.x - rect.width };
}

function companionDockTop(body: Rect, windowSize: number): number {
  return Math.min(
    windowSize - COMPANION_DOCK.height,
    body.y + body.height + COMPANION_DOCK.gap,
  );
}

function companionDockHitRect(body: Rect, windowSize: number): Rect {
  const dockTop = companionDockTop(body, windowSize);
  const left = body.x + body.width / 2 - COMPANION_DOCK_HIT_TARGET.width / 2;
  const top = Math.max(
    0,
    Math.min(
      windowSize - COMPANION_DOCK_HIT_TARGET.height,
      dockTop - (COMPANION_DOCK_HIT_TARGET.height - COMPANION_DOCK.height) / 2,
    ),
  );
  return {
    x: left,
    y: top,
    width: COMPANION_DOCK_HIT_TARGET.width,
    height: COMPANION_DOCK_HIT_TARGET.height,
  };
}

function companionInteractionRect(body: Rect, windowSize: number): Rect {
  const dock = companionDockHitRect(body, windowSize);
  const right = Math.max(body.x + body.width, dock.x + dock.width);
  const bottom = Math.max(body.y + body.height, dock.y + dock.height);
  return {
    x: Math.min(body.x, dock.x),
    y: Math.min(body.y, dock.y),
    width: right - Math.min(body.x, dock.x),
    height: bottom - Math.min(body.y, dock.y),
  };
}

function CompanionDock({
  body,
  windowSize,
}: {
  body: Rect;
  windowSize: number;
}): React.JSX.Element {
  const visualTop = companionDockTop(body, windowSize);
  const hitRect = companionDockHitRect(body, windowSize);
  const left = body.x + body.width / 2;
  const [dragging, setDragging] = useState(false);

  return (
    <div
      aria-label="Drag to reposition companion"
      data-companion-dock
      data-companion-dock-hit
      onMouseDown={() => {
        setDragging(true);
        window.api.beginCompanionPositionDrag();
      }}
      onMouseUp={() => setDragging(false)}
      role="img"
      style={
        {
          position: "absolute",
          left,
          top: hitRect.y,
          transform: "translateX(-50%)",
          width: hitRect.width,
          height: hitRect.height,
          boxSizing: "border-box",
          cursor: dragging ? "grabbing" : "grab",
          WebkitAppRegion: "drag",
        } as React.CSSProperties
      }
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "50%",
          top: visualTop - hitRect.y,
          transform: "translateX(-50%)",
          width: COMPANION_DOCK.width,
          height: COMPANION_DOCK.height,
          boxSizing: "border-box",
          borderRadius: 999,
          background: "rgba(10, 10, 10, 0.92)",
          border: "1px solid rgba(255, 255, 255, 0.22)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function CompanionStatusPill({
  body,
  facing,
  status,
  windowSize,
}: {
  body: Rect;
  facing: CompanionFacing;
  status: CompanionStatus;
  windowSize: number;
}): React.JSX.Element {
  // The companion has its own transparent, fixed-size window. Keep the
  // activity indicator inside that window rather than letting a fixed pill
  // width be clipped by its edge on smaller displays.
  const statusWidth = Math.min(164, windowSize - 16);
  const top = Math.max(8, body.y - 30);
  const towardDisplay = facing === "right" ? { left: 8 } : { right: 8 };

  return (
    <div
      aria-live="polite"
      role="status"
      style={{
        position: "absolute",
        top,
        width: statusWidth,
        minWidth: 0,
        height: 22,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "0 8px",
        border: "1px solid rgba(255, 255, 255, 0.14)",
        borderRadius: 999,
        background: "rgba(10, 10, 10, 0.94)",
        boxShadow: "0 3px 12px rgba(0, 0, 0, 0.34)",
        color: "rgba(245, 241, 228, 0.9)",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 9,
        lineHeight: 1,
        letterSpacing: "0.03em",
        pointerEvents: "none",
        ...towardDisplay,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 5,
          height: 5,
          flex: "0 0 auto",
          borderRadius: 999,
          background: "#8ab62a",
          boxShadow: "0 0 0 3px rgba(138, 182, 42, 0.12)",
        }}
      />
      <span
        title={status.label}
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {status.label}
      </span>
    </div>
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
  const [facing, setFacing] = useState<CompanionFacing>("right");
  const [status, setStatus] = useState<CompanionStatus | null>(null);

  useEffect(() => {
    window.api
      .companionForm()
      .then(setForm)
      .catch(() => setForm(DEFAULT_COMPANION_FORM));
    void window.api
      .companionOrientation()
      .then(setFacing)
      .catch(() => {});
    void window.api
      .companionStatus()
      .then(setStatus)
      .catch(() => {});
    const offForm = window.api.onCompanionForm(setForm);
    const offState = window.api.onCompanionState(setState);
    const offOrientation = window.api.onCompanionOrientation(setFacing);
    const offStatus = window.api.onCompanionStatus(setStatus);
    return () => {
      offForm?.();
      offState?.();
      offOrientation?.();
      offStatus?.();
    };
  }, []);

  const def = form ? SPRITES[form] : null;
  const windowSize = def?.windowSize ?? COMPANION_WINDOW_SIZE;
  const visualBody = useMemo(
    () =>
      companionRectForFacing(
        def?.body ?? SPARK_HOT_RECT,
        windowSize,
        def?.kind === "sheet" ? facing : "right",
      ),
    [def?.body, def?.kind, facing, windowSize],
  );
  const hotRect = useMemo(
    () => companionInteractionRect(visualBody, windowSize),
    [visualBody, windowSize],
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
        <SpriteStage
          def={def}
          facing={facing}
          hotRect={hotRect}
          state={state}
        />
      ) : (
        <SparkStage hotRect={hotRect} state={state} />
      )}
      {status ? (
        <CompanionStatusPill
          body={visualBody}
          facing={def.kind === "sheet" ? facing : "right"}
          status={status}
          windowSize={def.windowSize}
        />
      ) : null}
      <CompanionDock body={visualBody} windowSize={def.windowSize} />
    </button>
  );
}

installGlobalErrorHandlers();

const container = document.getElementById("root");
if (container) createRoot(container).render(<CompanionRoot />);
