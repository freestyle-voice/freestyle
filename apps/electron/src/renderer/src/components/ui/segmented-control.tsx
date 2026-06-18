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
}: {
  options: readonly SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  size?: "sm" | "default";
  className?: string;
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
        className,
      )}
    >
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            className="text-muted-foreground gap-1.5 rounded-md data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:font-medium data-[state=on]:shadow-sm"
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
