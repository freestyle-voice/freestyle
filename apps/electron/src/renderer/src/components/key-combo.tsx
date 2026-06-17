import { Kbd } from "@renderer/components/ui/kbd";
import { cn } from "@renderer/lib/utils";

function KeyBadge({
  label,
  variant = "default",
}: {
  label: string;
  variant?: "default" | "recording" | "dim";
}) {
  return (
    <Kbd
      className={cn(
        "min-w-[26px] rounded-md border px-1.5 py-1 font-mono leading-none shadow-[0_1px_0_0_hsl(var(--border))]",
        variant === "default" && "border-border bg-muted text-foreground",
        variant === "recording" &&
          "border-primary/40 bg-primary/10 text-primary",
        variant === "dim" &&
          "border-border/50 bg-muted/50 text-muted-foreground",
      )}
    >
      {label}
    </Kbd>
  );
}

export function KeyComboDisplay({
  keys,
  variant = "default",
}: {
  keys: string[];
  variant?: "default" | "recording" | "dim";
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {keys.map((k, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && (
            <span className="text-muted-foreground text-[10px]">+</span>
          )}
          <KeyBadge label={k} variant={variant} />
        </span>
      ))}
    </div>
  );
}
