import type React from "react";

export function DataSkeleton({
  label,
  rows = 3,
}: {
  label: string;
  rows?: number;
}): React.JSX.Element {
  return (
    <div
      className="tavern-data-skeleton"
      aria-busy="true"
      aria-label={label}
      role="status"
    >
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="tavern-data-skeleton-row" />
      ))}
    </div>
  );
}
