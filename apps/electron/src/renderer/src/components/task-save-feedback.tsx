import type { useRemixTaskEditor } from "@renderer/hooks/use-remix-task-editor";
import { Button } from "./ui/button";

export function TaskSaveFeedback({
  editor,
}: {
  editor: ReturnType<typeof useRemixTaskEditor>;
}) {
  if (editor.pending)
    return (
      <p role="status" className="text-muted-foreground py-2 text-xs">
        Saving tasks…
      </p>
    );
  if (!editor.error) return null;
  return (
    <div
      role="alert"
      className="text-destructive flex items-center justify-between gap-3 py-2 text-xs"
    >
      <span>Couldn’t save this change. Your draft is still here.</span>
      <Button variant="outline" size="sm" onClick={editor.retry}>
        Retry
      </Button>
    </div>
  );
}
