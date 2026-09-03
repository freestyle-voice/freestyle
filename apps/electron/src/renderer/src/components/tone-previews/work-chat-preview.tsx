import { cn } from "@renderer/lib/utils";

export function WorkChatPreview({
  sample,
  selected,
  sender,
  time,
}: {
  sample: string;
  selected: boolean;
  sender: string;
  time: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "w-full rounded-[18px] border px-3 py-3",
        selected ? "border-primary/35 bg-accent/55" : "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
            selected
              ? "border-primary/35 bg-primary text-primary-foreground"
              : "border-border bg-secondary text-secondary-foreground",
          )}
        >
          {sender.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground text-[13px] font-semibold">
              {sender}
            </span>
            <span className="text-muted-foreground text-[10.5px] font-medium">
              {time}
            </span>
          </div>
          <p className="text-foreground mt-1.5 text-[14px] leading-[1.5] break-words">
            {sample}
          </p>
        </div>
      </div>
    </div>
  );
}
