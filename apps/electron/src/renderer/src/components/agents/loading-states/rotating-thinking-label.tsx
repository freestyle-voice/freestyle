import { cn } from "@renderer/lib/utils";

import { ThinkingShimmer } from "./thinking-shimmer";

export function RotatingThinkingLabel({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <ThinkingShimmer className={cn("font-medium", className)}>
      Working…
    </ThinkingShimmer>
  );
}
