import { cn } from "@renderer/lib/utils";
import { Check, ChevronRight, type LucideIcon } from "lucide-react";

export function PickerOption({
  icon: Icon,
  title,
  hint,
  active,
  onClick,
  browseLabel,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  active: boolean;
  onClick: () => void;
  browseLabel: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={browseLabel}
      className={cn(
        "hover:bg-secondary/40 flex w-full items-center gap-3.5 px-5 py-4 text-left transition-[transform,background-color] duration-150 ease-out active:scale-[0.99]",
        active && "bg-primary/[0.04]",
      )}
    >
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="text-foreground text-[13px] font-medium">{title}</span>
        <span className="text-muted-foreground text-[12px]"> · {hint}</span>
      </div>
      {active && <Check className="text-primary size-4 shrink-0" />}
      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
    </button>
  );
}
