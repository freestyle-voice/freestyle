import { cn } from "@renderer/lib/utils";
import type { ComponentProps } from "react";

/**
 * Theme-native loading placeholder. Keep this deliberately restrained: the
 * active palette supplies its tone, while pulse provides motion without a
 * bright light-mode shimmer in dark surfaces.
 */
export function Skeleton({
  className,
  ...props
}: ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/70", className)}
      data-slot="skeleton"
      {...props}
    />
  );
}
