import { Button } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { Loader2 } from "lucide-react";

export function CloudSignInModal(): React.JSX.Element | null {
  const { signingIn, userCode, cancelSignIn } = useCloudAuth();
  if (!signingIn) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) cancelSignIn();
      }}
    >
      <DialogContent showCloseButton={false} className="max-w-xs">
        <div className="flex flex-col items-center gap-3 text-center">
          <DialogTitle className="text-[15px] font-semibold">
            Finish signing in
          </DialogTitle>
          <div className="border-border bg-secondary/60 w-full rounded-[10px] border py-3">
            <span className="mono text-foreground text-[20px] tracking-[0.3em]">
              {userCode ?? "····-····"}
            </span>
          </div>

          <div className="text-muted-foreground flex items-center gap-1.5 text-[12px]">
            <Loader2 className="size-3.5 animate-spin" />
            Waiting for approval…
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-1 w-full"
            onClick={() => cancelSignIn()}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
