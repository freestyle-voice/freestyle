import "./data-skeleton.css";

import type React from "react";

export type DataSkeletonVariant = "list" | "tasks" | "notes" | "files";

export function DataSkeleton({
  label,
  rows = 3,
  variant = "list",
}: {
  label: string;
  rows?: number;
  variant?: DataSkeletonVariant;
}): React.JSX.Element {
  return (
    <div
      className={`tavern-data-skeleton is-${variant}`}
      aria-busy="true"
      aria-label={label}
      role="status"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="tavern-data-skeleton-row">
          {variant === "tasks" ? (
            <>
              <span className="tavern-data-skeleton-check" />
              <span className="tavern-data-skeleton-copy">
                <i />
                {index === 1 ? <i /> : null}
              </span>
            </>
          ) : variant === "notes" ? (
            <span className="tavern-data-skeleton-copy">
              <i />
              <i />
            </span>
          ) : variant === "files" ? (
            <>
              <span className="tavern-data-skeleton-file-mark" />
              <span className="tavern-data-skeleton-copy">
                <i />
                <i />
              </span>
            </>
          ) : (
            <span className="tavern-data-skeleton-copy">
              <i />
              <i />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
