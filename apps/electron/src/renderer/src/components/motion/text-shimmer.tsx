import {
  TEXT_SHIMMER_CLASS_NAME,
  TEXT_SHIMMER_KEYFRAMES,
  textShimmerStyle,
} from "@renderer/lib/text-shimmer";
import { cn } from "@renderer/lib/utils";
import type { ElementType, ReactNode } from "react";

export interface TextShimmerProps {
  children: ReactNode;
  as?: ElementType;
  duration?: number;
  className?: string;
}

export function TextShimmer({
  children,
  as: Comp = "span",
  duration = 2.5,
  className,
}: TextShimmerProps) {
  return (
    <>
      <style>{TEXT_SHIMMER_KEYFRAMES}</style>
      <Comp
        style={textShimmerStyle(duration)}
        className={cn("inline-block", TEXT_SHIMMER_CLASS_NAME, className)}
      >
        {children}
      </Comp>
    </>
  );
}
