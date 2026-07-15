import { DragSpacer } from "@renderer/components/drag-spacer";
import { cn } from "@renderer/lib/utils";

// ---------------------------------------------------------------------------
// PageShell — draggable topbar + padded scroll area, matches history/dictionary/tone
// ---------------------------------------------------------------------------

export function PageShell({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DragSpacer />
      <div className="responsive-page-scroll flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageHeader — editorial title with italic accent
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  /** Optional small pill rendered next to the title (e.g. "Beta"). */
  badge?: string;
}): React.JSX.Element {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div>
        <h1 className="serif text-foreground m-0 flex items-baseline gap-3 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
          <span>
            <span className="serif-italic text-primary">{title}</span>
            <span>. </span>
          </span>
          {badge ? (
            <span className="bg-primary/12 text-primary mono relative -top-[6px] rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]">
              {badge}
            </span>
          ) : null}
        </h1>
        {subtitle && (
          <p className="text-muted-foreground mt-2.5 max-w-[480px] text-[14px] leading-[1.5]">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eyebrow — small section label shared across settings pages
// ---------------------------------------------------------------------------

export function Eyebrow({
  text,
  accent,
  mono = false,
}: {
  text: string;
  accent?: boolean;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <span
      className={cn(
        "text-[11px] font-semibold",
        mono && "mono",
        accent ? "text-primary" : "text-muted-foreground",
      )}
    >
      {text}
    </span>
  );
}
