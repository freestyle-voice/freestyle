import type { BubbleState } from "@renderer/components/companion";
import type { CompanionState } from "@shared/companion";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { SheetEngine } from "./engine";
import { Performer } from "./performer";
import type { SheetSpriteDefinition } from "./types";

function bubbleText(
  bubble: BubbleState | null,
  maxChars: number,
): string | null {
  if (!bubble) return null;
  const partial = bubble.partial.trim();
  if (partial) {
    return partial.length > maxChars ? `…${partial.slice(-maxChars)}` : partial;
  }
  return bubble.phase === "recording" ? "I'm listening…" : "…";
}

/**
 * The stage for any sheet sprite: one canvas driven by SheetEngine, a
 * Performer arbitrating the event stream, the body hitbox for hover, and
 * the speech bubble for dictation. Sprite-specific facts all come from the
 * definition — this component never mentions a character by name.
 */
export function SpriteStage({
  def,
  state,
  bubble,
}: {
  def: SheetSpriteDefinition;
  state: CompanionState;
  bubble: BubbleState | null;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const performerRef = useRef<Performer | null>(null);
  const [say, setSay] = useState<string | null>(null);
  const [shout, setShout] = useState<string | null>(null);
  const shoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new SheetEngine(canvas, def);
    const performer = new Performer(
      engine,
      def,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      {
        onShout: (text) => {
          setShout(text);
          if (shoutTimer.current) clearTimeout(shoutTimer.current);
          shoutTimer.current = setTimeout(() => setShout(null), 1_500);
        },
      },
    );
    performerRef.current = performer;
    (window as unknown as Record<string, unknown>).__spriteTest = {
      handle: (ev: unknown) =>
        performer.handle(ev as Parameters<Performer["handle"]>[0]),
      snapshot: () => performer.snapshot(),
    };

    window.api.companionSetHotRect(def.hotRect);
    const offEvents = window.api.onSpriteEvent((ev) => performer.handle(ev));
    const offHot = window.api.onCompanionHotEnter(() => performer.wake());
    const hitbox = document.getElementById("sprite-hitbox");
    const onEnter = (): void => performer.wake();
    hitbox?.addEventListener("mouseenter", onEnter);

    return () => {
      performerRef.current = null;
      performer.destroy();
      engine.destroy();
      offEvents();
      offHot();
      hitbox?.removeEventListener("mouseenter", onEnter);
      if (shoutTimer.current) clearTimeout(shoutTimer.current);
    };
  }, [def]);

  useEffect(() => {
    performerRef.current?.handle({ kind: "thinking", on: state === "working" });
    if (state === "suggestion") {
      performerRef.current?.handle({ kind: "emote", emotion: "proud" });
    }
  }, [state]);

  useEffect(() => {
    performerRef.current?.handle({ kind: "listening", on: bubble !== null });
    setSay(bubbleText(bubble, def.bubble.maxChars));
  }, [bubble, def]);

  return (
    <div className="sprite-stage">
      <style>{`
        html, body, #root { margin: 0; height: 100%; background: transparent; overflow: hidden; }
        .sprite-stage { position: relative; width: ${def.windowSize}px; height: ${def.windowSize}px; -webkit-user-select: none; user-select: none; }
        canvas { image-rendering: pixelated; }
        /* Manga speech balloon (listening): tail pinned to the mouth. */
        .sprite-bubble {
          position: absolute;
          left: ${def.bubble.x}px;
          bottom: ${def.bubble.y}px;
          max-width: ${def.windowSize - def.bubble.x - 14}px;
          padding: 8px 12px;
          background: #fbf5e4;
          border: 3px solid #2a2114;
          border-radius: 16px;
          color: #8e7f5f;
          font: 500 11px/1.45 "Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif;
          text-align: left;
          pointer-events: none;
          white-space: pre-wrap;
          box-shadow: 4px 4px 0 rgba(42, 33, 20, 0.8);
        }
        .sprite-bubble::before {
          content: "";
          position: absolute;
          left: 12px;
          bottom: -17px;
          border-style: solid;
          border-width: 18px 16px 0 5px;
          border-color: #2a2114 transparent transparent transparent;
          transform: rotate(14deg);
        }
        .sprite-bubble::after {
          content: "";
          position: absolute;
          left: 16px;
          bottom: -11px;
          border-style: solid;
          border-width: 13px 12px 0 3px;
          border-color: #fbf5e4 transparent transparent transparent;
          transform: rotate(14deg);
        }
        /* Shout burst (paste lands): jagged flash. */
        .sprite-shout {
          position: absolute;
          left: ${def.bubble.x}px;
          bottom: ${def.bubble.y + 16}px;
          background: #fbf5e4;
          border: 3px solid #2a2114;
          padding: 10px 18px;
          font-family: "Pixelify Sans", monospace;
          font-size: 16px;
          color: #2a2114;
          box-shadow: 5px 5px 0 #d98e2b;
          pointer-events: none;
          clip-path: polygon(
            3% 12%, 12% 0, 30% 7%, 50% 0, 68% 8%, 88% 0, 97% 14%, 100% 40%,
            94% 60%, 100% 86%, 86% 100%, 64% 92%, 44% 100%, 24% 93%, 8% 100%,
            0 78%, 5% 52%, 0 30%
          );
        }
      `}</style>
      <canvas ref={canvasRef} width={def.windowSize} height={def.windowSize} />
      <div
        id="sprite-hitbox"
        style={{
          position: "absolute",
          left: def.hotRect.x,
          top: def.hotRect.y,
          width: def.hotRect.width,
          height: def.hotRect.height,
        }}
      />
      {shout ? (
        <div className="sprite-shout">{shout}</div>
      ) : say ? (
        <div className="sprite-bubble">{say}</div>
      ) : null}
    </div>
  );
}
