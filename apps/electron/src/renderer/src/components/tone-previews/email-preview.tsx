import { cn } from "@renderer/lib/utils";

function splitEmailBody(body: string): {
  greeting: string | null;
  paragraphs: string[];
  signoff: string | null;
} {
  const blocks = body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return { greeting: null, paragraphs: [], signoff: null };
  }

  const greeting = blocks[0]?.match(/^[A-Za-z].*,?$/) ? blocks[0] : null;
  const signoff =
    blocks.length > 1 && blocks.at(-1)?.split("\n").length === 1
      ? (blocks.at(-1) ?? null)
      : null;

  const start = greeting ? 1 : 0;
  const paragraphs = blocks.slice(start, signoff ? -1 : undefined);

  return { greeting, paragraphs, signoff };
}

export function EmailPreview({
  body,
  selected,
  to,
  subject,
}: {
  body: string;
  selected: boolean;
  to: string;
  subject: string;
}): React.JSX.Element {
  const { greeting, paragraphs, signoff } = splitEmailBody(body);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[18px] border",
        selected ? "border-primary/35 bg-accent/45" : "border-border bg-card",
      )}
    >
      <div className="bg-background/75 border-border/80 border-b px-3 py-2.5">
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <span className="mono text-muted-foreground text-[9px] uppercase tracking-[0.16em]">
              To
            </span>
            <span className="text-foreground text-[12px]">{to}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="mono text-muted-foreground text-[9px] uppercase tracking-[0.16em]">
              Subject
            </span>
            <span className="text-foreground text-[12px]">{subject}</span>
          </div>
        </div>
      </div>
      <div className="space-y-3 px-3 py-3">
        {greeting && (
          <p className="text-foreground text-[13px] leading-[1.45]">
            {greeting}
          </p>
        )}
        {paragraphs.map((paragraph) => (
          <p
            key={paragraph}
            className="text-foreground text-[13px] leading-[1.5]"
          >
            {paragraph}
          </p>
        ))}
        {signoff && (
          <p className="text-foreground text-[13px] leading-[1.45]">
            {signoff}
          </p>
        )}
      </div>
    </div>
  );
}
