import { Skeleton } from "@renderer/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Skeleton loading — mirrors PluginCard / CatalogCard / Detail shape
// ---------------------------------------------------------------------------

function SkeletonLine({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return <Skeleton className={`rounded-full ${className ?? ""}`} />;
}

function PluginCardSkeleton(): React.JSX.Element {
  return (
    <div className="border-border bg-card flex w-full items-center gap-4 rounded-[14px] border p-5">
      {/* Icon placeholder */}
      <SkeletonLine className="size-11 shrink-0 rounded-[10px]" />

      {/* Name + description */}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <SkeletonLine className="h-4 w-36" />
          <SkeletonLine className="h-3 w-10" />
        </div>
        <SkeletonLine className="h-3 w-full max-w-[260px]" />
      </div>

      {/* Action button placeholder */}
      <SkeletonLine className="h-8 w-20 shrink-0 rounded-md" />
    </div>
  );
}

export function PluginsLoadingSkeleton(): React.JSX.Element {
  return (
    <div
      className="flex flex-col gap-3"
      role="status"
      aria-label="Loading plugins"
    >
      {[0, 1, 2].map((i) => (
        <PluginCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function PluginDetailSkeleton(): React.JSX.Element {
  return (
    <div role="status" aria-label="Loading plugin details">
      {/* Header area */}
      <div className="mb-7 flex items-end justify-between gap-4">
        <div className="space-y-3">
          <SkeletonLine className="h-10 w-64" />
          <SkeletonLine className="h-4 w-96 max-w-full" />
          <div className="flex items-center gap-2">
            <SkeletonLine className="h-3 w-14" />
            <SkeletonLine className="h-3 w-24" />
            <SkeletonLine className="h-3 w-40" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <SkeletonLine className="h-8 w-20 rounded-md" />
          <SkeletonLine className="h-5 w-10 rounded-full" />
          <SkeletonLine className="h-8 w-24 rounded-md" />
        </div>
      </div>

      <hr className="border-border" />

      {/* Readme placeholder */}
      <div className="mt-6 space-y-4">
        <SkeletonLine className="h-5 w-48" />
        <SkeletonLine className="h-3 w-full" />
        <SkeletonLine className="h-3 w-full" />
        <SkeletonLine className="h-3 w-3/4" />
        <SkeletonLine className="h-3 w-full" />
        <SkeletonLine className="h-3 w-5/6" />
      </div>
    </div>
  );
}
