import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import { Check, ChevronRight, type LucideIcon, X } from "lucide-react";

export const PICKER_MODAL_BODY = "space-y-5 px-6 py-6";

export function PickerModalHeader({
  icon: Icon,
  title,
  onClose,
}: {
  icon: LucideIcon;
  title: string;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <header className="border-border flex shrink-0 items-center gap-3 border-b px-6 py-4">
      <Icon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
      <span className="text-foreground flex-1 text-[13px] font-semibold">
        {title}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        className="shrink-0"
        aria-label="Close"
      >
        <X />
      </Button>
    </header>
  );
}

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
