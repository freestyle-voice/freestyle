import { cn } from "@renderer/lib/utils";
import type * as React from "react";

/**
 * Keyframes for the shimmer sweep. Injected once (deduped by id) the first time
 * any Skeleton mounts, so callers don't each ship their own `<style>` tag.
 */
const SHIMMER_STYLE_ID = "freestyle-skeleton-shimmer";
const SHIMMER_KEYFRAMES = `@keyframes shimmer { 100% { transform: translateX(100%); } }`;

function ensureShimmerStyle(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(SHIMMER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SHIMMER_STYLE_ID;
  style.textContent = SHIMMER_KEYFRAMES;
  document.head.appendChild(style);
}

/**
 * A single shimmering placeholder block. Size and corner radius are controlled
 * via `className` (e.g. `h-4 w-20`, `size-5 rounded`). Defaults to the pill
 * shape used by most list-row skeletons; pass `rounded-md`/`rounded` to square
 * off the corners.
 *
 * The shimmer is a `before:` gradient that sweeps left-to-right; the keyframes
 * are injected globally on first mount so the animation works regardless of
 * where the skeleton is rendered.
 */
function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">): React.JSX.Element {
  ensureShimmerStyle();
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "bg-muted/60 relative overflow-hidden rounded-full",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
