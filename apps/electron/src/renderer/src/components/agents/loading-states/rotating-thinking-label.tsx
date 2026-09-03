import { cn } from "@renderer/lib/utils";
import { useEffect, useState } from "react";

import { ThinkingShimmer } from "./thinking-shimmer";

export const REMIX_THINKING_MESSAGES = [
  "Thinking…",
  "Contemplating…",
  "Finding the right thread…",
  "One moment — bringing it together…",
] as const;

interface RotatingThinkingLabelProps {
  className?: string;
  intervalMs?: number;
}

/**
 * A compact, live status label used until Remix has meaningful stream or tool
 * activity to show. Keeping it shared prevents the pill and workspace from
 * drifting into different loading states.
 */
export function RotatingThinkingLabel({
  className,
  intervalMs = 2_600,
}: RotatingThinkingLabelProps): React.JSX.Element {
  const [messageIndex, setMessageIndex] = useState(0);
  const message = REMIX_THINKING_MESSAGES[messageIndex];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMessageIndex((index) => (index + 1) % REMIX_THINKING_MESSAGES.length);
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [intervalMs]);

  return (
    <ThinkingShimmer
      key={message}
      duration={intervalMs / 1_000}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-0.5 font-medium duration-300",
        className,
      )}
    >
      {message}
    </ThinkingShimmer>
  );
}
