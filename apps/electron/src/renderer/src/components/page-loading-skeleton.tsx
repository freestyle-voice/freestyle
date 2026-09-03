import { DragSpacer } from "@renderer/components/drag-spacer";
import { Skeleton } from "@renderer/components/ui/skeleton";

/**
 * First-load frame for the Dictionary and Vocabulary pages. It reserves the
 * same title, toolbar, and entry-list geometry as the populated page so data
 * arrival does not replace a centered status message with a different layout.
 */
export function DictionaryLikePageSkeleton(): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DragSpacer />
      <div
        aria-busy="true"
        aria-label="Loading entries"
        className="responsive-page-scroll flex-1 overflow-auto"
        role="status"
      >
        <div className="mb-7 space-y-3">
          <Skeleton className="h-11 w-52 max-w-full" />
          <Skeleton className="h-4 w-[min(34rem,80%)] max-w-full" />
        </div>

        <div className="mb-5 flex flex-col gap-2.5 min-[1080px]:flex-row">
          <Skeleton className="h-10 min-w-0 flex-1 rounded-lg" />
          <div className="flex gap-2.5">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>

        <div className="border-border bg-card overflow-hidden rounded-[12px] border">
          {["first", "second", "third", "fourth"].map((row) => (
            <div
              key={row}
              className="border-border/60 grid min-h-[57px] items-center gap-3.5 border-b px-5 py-3.5 last:border-b-0 [grid-template-columns:minmax(7rem,0.7fr)_minmax(0,2fr)_4rem_2rem] max-[900px]:grid-cols-1"
            >
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-10 justify-self-end max-[900px]:justify-self-start" />
              <Skeleton className="size-7 justify-self-end max-[900px]:hidden" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
