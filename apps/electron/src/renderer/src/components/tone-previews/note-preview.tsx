import { cn } from "@renderer/lib/utils";

// A neutral "typed into any field" preview for the Everything else group, where
// the destination surface is unknown. Deliberately plainer than the chat/email
// previews so it doesn't imply a specific app.
export function NotePreview({
  sample,
  selected,
}: {
  sample: string;
  selected: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "rounded-[18px] border px-4 py-3.5",
        selected ? "border-primary/35 bg-accent/45" : "border-border bg-card",
      )}
    >
      <p className="text-foreground text-[14px] leading-[1.5]">
        {sample}
        {selected ? (
          <span
            aria-hidden="true"
            className="bg-foreground/70 ml-0.5 inline-block h-[1.05em] w-px translate-y-[0.15em]"
          />
        ) : null}
      </p>
    </div>
  );
}
