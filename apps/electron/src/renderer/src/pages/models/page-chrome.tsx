import { cn } from "@renderer/lib/utils";

// ---------------------------------------------------------------------------
// PageShell — draggable topbar + padded scroll area, matches history/dictionary/formats
// ---------------------------------------------------------------------------

export function PageShell({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="h-7 shrink-0" />
      <div
        className="responsive-page-scroll flex-1 overflow-auto"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
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
}: {
  title: string;
  subtitle?: string;
}): React.JSX.Element {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div>
        <h1 className="serif text-foreground m-0 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
          <span className="serif-italic text-primary">{title}</span>
          <span>. </span>
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
// Eyebrow — small uppercase label shared across sections
// ---------------------------------------------------------------------------

export function Eyebrow({
  text,
  accent,
  mono = true,
}: {
  text: string;
  accent?: boolean;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <span
      className={cn(
        "text-[10px] uppercase",
        mono ? "mono" : "font-semibold",
        accent ? "text-primary" : "text-muted-foreground",
      )}
      style={{ letterSpacing: "0.14em" }}
    >
      {text}
    </span>
  );
}
