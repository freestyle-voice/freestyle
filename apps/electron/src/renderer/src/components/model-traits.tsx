import { Meter } from "@renderer/components/voice-row";
import { cn } from "@renderer/lib/utils";
import { Target, Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export interface ModelTraitValues {
  speed?: number;
  quality?: number;
}

function TraitMeter({
  icon: Icon,
  label,
  value,
  compact,
}: {
  icon: typeof Zap;
  label: string;
  value: number;
  compact?: boolean;
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center",
            compact ? "gap-1" : "gap-1.5",
          )}
        >
          <Icon
            className={cn(
              "text-muted-foreground shrink-0",
              compact ? "size-3" : "size-3.5",
            )}
            aria-hidden
          />
          <Meter value={value} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Speed + accuracy meters with icon labels — scannable at a glance. */
export function ModelTraits({
  speed,
  quality,
  compact,
  className,
}: ModelTraitValues & {
  compact?: boolean;
  className?: string;
}): React.JSX.Element | null {
  if (speed == null && quality == null) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center",
        compact ? "gap-3" : "gap-4",
        className,
      )}
    >
      {speed != null && (
        <TraitMeter icon={Zap} label="Speed" value={speed} compact={compact} />
      )}
      {quality != null && (
        <TraitMeter
          icon={Target}
          label="Accuracy"
          value={quality}
          compact={compact}
        />
      )}
    </div>
  );
}
