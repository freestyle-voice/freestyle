import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@renderer/components/ui/alert-dialog";
import type { DeletionConfirmationScope } from "@renderer/lib/deletion-confirmation";
import { setDeletionConfirmationSkipped } from "@renderer/lib/deletion-confirmation";
import { useEffect, useState } from "react";

/** A shared, locally remembered confirmation for a destructive UI action. */
export function DeleteConfirmationDialog({
  open,
  scope,
  title,
  description,
  confirmLabel,
  busy = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  scope: DeletionConfirmationScope;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (skipConfirmation: boolean) => void;
}): React.JSX.Element {
  const [skipConfirmation, setSkipConfirmation] = useState(false);

  useEffect(() => {
    if (open) setSkipConfirmation(false);
  }, [open]);

  const confirm = (): void => {
    if (skipConfirmation) setDeletionConfirmationSkipped(scope, true);
    onConfirm(skipConfirmation);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground select-none">
          <input
            type="checkbox"
            className="accent-primary size-3.5 rounded"
            checked={skipConfirmation}
            onChange={(event) => setSkipConfirmation(event.target.checked)}
          />
          Don&apos;t ask me again
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={confirm}
          >
            {busy ? "Deleting…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
