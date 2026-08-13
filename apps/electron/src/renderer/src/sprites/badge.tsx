import { Spark } from "@renderer/components/spark";
import type { SpriteId } from "@shared/sprites";
import type React from "react";
import { useEffect, useRef } from "react";
import { SPRITES } from "./registry";
import type { SheetSpriteDefinition } from "./types";

/**
 * A tiny portrait of a sprite — the body crop of its idle sheet's first
 * frame — for chrome that names the character (panel head, settings
 * picker). Custom sprites (Spark) render their own component.
 */
export function SpriteBadge({
  form,
  size = 20,
  working = false,
}: {
  form: SpriteId;
  size?: number;
  working?: boolean;
}): React.JSX.Element {
  const def = SPRITES[form];
  if (def.kind !== "sheet") {
    return <Spark state={working ? "working" : "idle"} size={11} />;
  }
  return <SheetBadge def={def} size={size} working={working} />;
}

function SheetBadge({
  def,
  size,
  working,
}: {
  def: SheetSpriteDefinition;
  size: number;
  working: boolean;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scale = def.manifest.scale;
  const spriteSize = def.manifest.frameSize * scale;
  const dx = def.draw?.dx ?? (def.windowSize - spriteSize) / 2;
  const dy = def.draw?.dy ?? def.windowSize - spriteSize - 8;
  // The hot rect is the measured body in window coordinates; undo the draw
  // offset and scale to find the same region inside the 1x sheet frame.
  const cropX = (def.hotRect.x - dx) / scale;
  const cropY = (def.hotRect.y - dy) / scale;
  const cropW = def.hotRect.width / scale;
  const cropH = def.hotRect.height / scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const idle = def.manifest.states.idle;
    const url = idle ? def.sheets[idle.sheet] : null;
    if (!canvas || !ctx || !idle || !url) return;
    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        img,
        (idle.start ?? 0) * def.manifest.frameSize + cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    };
    img.src = url;
  }, [def, cropX, cropY, cropW, cropH]);

  return (
    <canvas
      ref={canvasRef}
      width={def.hotRect.width}
      height={def.hotRect.height}
      className={`tavern-sprite-badge${working ? " is-working" : ""}`}
      style={{ width: Math.round((size * cropW) / cropH), height: size }}
    />
  );
}
