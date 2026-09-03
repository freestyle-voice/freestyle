import { cn } from "@renderer/lib/utils";

export function TextMessagePreview({
  sample,
  selected,
}: {
  sample: string;
  selected: boolean;
}): React.JSX.Element {
  return (
    <div className="bg-background/75 rounded-[18px] border border-border/80 px-3 py-3">
      <div className="flex justify-end">
        <div
          className={cn(
            "relative max-w-[27ch] rounded-[20px] border px-4 py-3 text-[14px] leading-[1.45] shadow-none",
            selected
              ? "border-primary/35 bg-accent text-accent-foreground"
              : "border-border bg-card text-foreground",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute right-[-5px] bottom-3 h-3 w-3 rotate-45 rounded-[3px] border",
              selected
                ? "border-primary/35 bg-accent"
                : "border-border bg-card",
            )}
          />
          <span className="relative block">{sample}</span>
        </div>
      </div>
    </div>
  );
}
