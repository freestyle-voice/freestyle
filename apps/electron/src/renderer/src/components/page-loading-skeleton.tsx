import { Skeleton } from "@renderer/components/ui/skeleton";

/**
 * First-load rows for Dictionary and Vocabulary. The surrounding pages render
 * their static title and controls immediately; only user-created entries wait
 * for their own query.
 */
export function DictionaryLikeEntriesSkeleton(): React.JSX.Element {
  return (
    <div
      aria-busy="true"
      aria-label="Loading entries"
      className="border-border bg-card overflow-hidden rounded-[12px] border"
      role="status"
    >
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
  );
}
