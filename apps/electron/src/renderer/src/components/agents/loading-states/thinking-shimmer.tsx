import { TextShimmer } from "@renderer/components/motion/text-shimmer";
import { cn } from "@renderer/lib/utils";
import type { ReactNode } from "react";

export interface ThinkingShimmerProps {
  children?: ReactNode;
  duration?: number;
  className?: string;
}

export function ThinkingShimmer({
  children = "Thinking…",
  duration = 1.8,
  className,
}: ThinkingShimmerProps) {
  return (
    <TextShimmer
      as="span"
      duration={duration}
      className={cn("font-medium", className)}
    >
      {children}
    </TextShimmer>
  );
}
