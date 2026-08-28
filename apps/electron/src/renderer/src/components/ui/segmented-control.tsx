import {
  ToggleGroup,
  ToggleGroupItem,
} from "@renderer/components/ui/toggle-group";
import { cn } from "@renderer/lib/utils";
import type { LucideIcon } from "lucide-react";
import type * as React from "react";

export type SegmentedOption = {
  value: string;
  label: React.ReactNode;
  icon?: LucideIcon;
};

/**
 * A single-select segmented control (the "pill track" toggle used for theme,
 * output mode, activation, source, etc). Wraps a Radix `ToggleGroup` with the
 * shared editorial track styling so the look stays consistent everywhere.
 */
function SegmentedControl({
  options,
  value,
  onValueChange,
  size = "default",
  className,
  wrap,
}: {
  options: readonly SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  size?: "sm" | "default";
  className?: string;
  // When true the track collapses into a 2-column grid on narrower windows
  // (so options with longer labels don't overflow), expanding back to a
  // single row once there's room. Useful for 4-option controls.
  wrap?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      // Radix fires "" when the active item is re-clicked — ignore it so the
      // control always keeps a selection.
      onValueChange={(v) => v && onValueChange(v)}
      spacing={0.5}
      size={size}
      className={cn(
        "border-border bg-secondary max-w-full rounded-[9px] border p-[3px]",
        wrap && "grid w-full grid-cols-2 min-[1360px]:flex min-[1360px]:w-fit",
        className,
      )}
    >
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            className={cn(
              "text-muted-foreground gap-1.5 rounded-md data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:font-medium data-[state=on]:shadow-sm",
              wrap && "w-full justify-center min-[1360px]:w-auto",
            )}
          >
            {Icon && <Icon data-icon="inline-start" />}
            {o.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

export { SegmentedControl };
