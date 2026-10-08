import type React from "react";

/** One geometry for the model overview, including its loading placeholders. */
export function ModelSettingRow({
  label,
  model,
  detail,
  actions,
  children,
  separator = true,
}: {
  label: React.ReactNode;
  model: React.ReactNode;
  detail?: React.ReactNode;
  actions: React.ReactNode;
  children?: React.ReactNode;
  separator?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={`border-border grid min-h-[88px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-4 @min-[560px]:grid-cols-[120px_minmax(0,1fr)_auto] @min-[560px]:px-5${separator ? " border-b" : ""}`}
    >
      <h2 className="text-muted-foreground col-span-2 m-0 text-[12px] font-medium @min-[560px]:col-span-1">
        {label}
      </h2>
      <div className="min-w-0">
        <div className="text-foreground text-[15px] font-medium leading-snug">
          {model}
        </div>
        {detail && (
          <div className="text-muted-foreground mt-1 text-[12px] leading-snug">
            {detail}
          </div>
        )}
        {children}
      </div>
      <div className="text-foreground flex shrink-0 items-center gap-3">
        {actions}
      </div>
    </div>
  );
}
