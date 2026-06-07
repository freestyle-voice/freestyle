import { cn } from "@renderer/lib/utils";
import { type Mic, X } from "lucide-react";

import type { PickerFilter } from "./types";

// ---------------------------------------------------------------------------
// Picker shell - shared chrome for voice and LLM model pickers
// ---------------------------------------------------------------------------

export function ModelPickerShell({
  icon: Icon,
  title,
  filters,
  activeFilter,
  onFilterChange,
  headerAccessory,
  banner,
  empty,
  emptyText = "No models match this filter.",
  children,
  onClose,
}: {
  icon: typeof Mic;
  title: string;
  filters: PickerFilter[];
  activeFilter: string;
  onFilterChange: (id: string) => void;
  headerAccessory?: React.ReactNode;
  banner?: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <section className="border-border bg-card overflow-hidden rounded-[14px] border shadow-[0_24px_50px_-34px_rgba(20,12,4,0.4)]">
      <header className="border-border flex min-w-0 flex-wrap items-center gap-2.5 border-b px-5 py-3.5">
        <Icon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        <span
          className="mono text-foreground min-w-0 flex-1 truncate text-[11px] uppercase"
          style={{ letterSpacing: "0.14em" }}
        >
          {title}
        </span>
        {headerAccessory ?? <div className="flex-1" />}
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Close picker"
        >
          <X size={16} />
        </button>
      </header>

      <div className="border-border flex flex-wrap items-center gap-2 border-b px-5 py-3">
        {filters.map((f) => {
          const on = activeFilter === f.id;
          const FilterIcon = f.icon;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary/60",
              )}
            >
              {FilterIcon && <FilterIcon className="h-3 w-3" />}
              {f.mark && (
                <span
                  className="border-current/35 inline-flex h-4 min-w-4 items-center justify-center rounded-full border px-1 text-[8px] font-semibold leading-none"
                  aria-hidden="true"
                >
                  {f.mark}
                </span>
              )}
              {f.label}
            </button>
          );
        })}
      </div>

      {banner}

      <div className="max-h-[440px] overflow-y-auto">
        {empty ? (
          <div className="text-muted-foreground px-5 py-10 text-center text-[13px]">
            {emptyText}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
