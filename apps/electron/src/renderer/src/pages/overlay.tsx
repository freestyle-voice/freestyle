import type { GuidanceEvent } from "@freestyle/validations";
import { useEffect, useState } from "react";

/**
 * Guided-mode "ghost cursor" overlay. Renders on a transparent, click-through
 * window covering the primary display, so coordinates map 1:1 to the agent's
 * screenshot space. It only ever points — the real desktop underneath stays
 * fully usable, and the user performs each step.
 */

const ACCENT = "#7C3AED"; // matches the orb's violet

type Tracked = { event: GuidanceEvent; seq: number };

function defaultLabel(e: GuidanceEvent): string {
  switch (e.kind) {
    case "move":
      return "Move here";
    case "click":
      return "Click here";
    case "right_click":
      return "Right-click here";
    case "double_click":
      return "Double-click here";
    case "type":
      return e.text ? `Type "${e.text}"` : "Type here";
    case "key":
      return e.text ? `Press ${e.text}` : "Press a key";
    default:
      return "";
  }
}

export default function OverlayPage(): React.JSX.Element | null {
  const [tracked, setTracked] = useState<Tracked | null>(null);

  useEffect(() => {
    let seq = 0;
    const off = window.api?.overlay?.onGuidance((event) => {
      if (event.kind === "clear") {
        setTracked(null);
        return;
      }
      seq += 1;
      setTracked({ event, seq });
    });
    return () => off?.();
  }, []);

  if (!tracked) return null;
  const { event, seq } = tracked;
  const hasPoint = typeof event.x === "number" && typeof event.y === "number";
  const x = event.x ?? 0;
  const y = event.y ?? 0;

  const isClick =
    event.kind === "click" ||
    event.kind === "right_click" ||
    event.kind === "double_click";

  // Caption: place it beside the cursor, flipping side/edge near the screen
  // borders so it never runs off-screen. For point-less steps (type/key) center
  // it near the top.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const flipX = hasPoint && x > vw - 320;
  const flipY = hasPoint && y > vh - 140;
  const caption = event.caption?.trim() || defaultLabel(event);
  const literal =
    (event.kind === "type" || event.kind === "key") && event.text
      ? event.text
      : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <style>{keyframes}</style>

      {/* Action ring (click feedback), re-triggered per event via key */}
      {hasPoint && isClick && (
        <div
          key={`ring-${seq}`}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: 0,
            height: 0,
            transform: "translate(-50%, -50%)",
          }}
        >
          <span style={ringStyle(0)} />
          {event.kind === "double_click" && <span style={ringStyle(0.25)} />}
        </div>
      )}

      {/* Ghost cursor (glides to the target) */}
      {hasPoint && (
        <div
          style={{
            position: "absolute",
            left: x,
            top: y,
            transform: "translate(-3px, -2px)",
            transition:
              "left 480ms cubic-bezier(0.22, 1, 0.36, 1), top 480ms cubic-bezier(0.22, 1, 0.36, 1)",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.45))",
          }}
        >
          <GhostCursor />
        </div>
      )}

      {/* Caption — outer div positions, inner div animates (so the entrance
          animation can't fight the centering transform) */}
      <div
        style={{
          position: "absolute",
          maxWidth: 300,
          ...(hasPoint
            ? {
                left: flipX ? undefined : x + 22,
                right: flipX ? vw - x + 22 : undefined,
                top: flipY ? undefined : y + 20,
                bottom: flipY ? vh - y + 20 : undefined,
              }
            : {
                left: 0,
                right: 0,
                top: 48,
                display: "flex",
                justifyContent: "center",
              }),
        }}
      >
        <div
          key={`cap-${seq}`}
          style={{ animation: "ghost-pop 220ms ease-out both" }}
        >
          <div style={captionPill}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: ACCENT,
                flexShrink: 0,
                boxShadow: `0 0 8px ${ACCENT}`,
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
              {caption}
            </span>
          </div>
          {literal && (
            <div style={literalBadge}>
              <span style={{ opacity: 0.6, fontSize: 11 }}>
                {event.kind === "key" ? "key" : "text"}
              </span>
              <span
                style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
              >
                {literal}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GhostCursor(): React.JSX.Element {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden="true"
      style={{ animation: "ghost-bob 1.6s ease-in-out infinite" }}
    >
      <title>Guidance cursor</title>
      <path
        d="M5 3.2 L5 20.5 L9.4 16.2 L12.2 22.4 L15 21.1 L12.2 15 L18.3 15 Z"
        fill="white"
        stroke="#1f2937"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ringStyle(delaySec: number): React.CSSProperties {
  return {
    position: "absolute",
    left: 0,
    top: 0,
    width: 18,
    height: 18,
    marginLeft: -9,
    marginTop: -9,
    borderRadius: 999,
    border: `2.5px solid ${ACCENT}`,
    animation: `ghost-ring 900ms ease-out ${delaySec}s both`,
  };
}

const captionPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 12px",
  borderRadius: 999,
  background: "rgba(17, 17, 20, 0.92)",
  color: "white",
  boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
  backdropFilter: "blur(6px)",
  whiteSpace: "normal",
};

const literalBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  marginTop: 6,
  padding: "4px 10px",
  borderRadius: 8,
  background: "rgba(17, 17, 20, 0.82)",
  color: "white",
};

const keyframes = `
  @keyframes ghost-ring {
    0% { transform: scale(0.5); opacity: 0.9; }
    100% { transform: scale(3.6); opacity: 0; }
  }
  @keyframes ghost-pop {
    0% { opacity: 0; transform: translateY(4px) scale(0.96); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes ghost-bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }
`;
