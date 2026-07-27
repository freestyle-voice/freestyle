import { Button } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { useCloudAuth } from "@renderer/lib/auth-context";

/**
 * Prompts the user to sign in again after their Freestyle Cloud session has
 * lapsed (e.g. the 7-day token expired while the app was closed, so the
 * server-side keep-alive could not slide the window in time). Suppressed while
 * a sign-in is already in flight.
 */
export function SessionExpiredModal(): React.JSX.Element | null {
  const { sessionExpired, signingIn, signIn, dismissSessionExpired } =
    useCloudAuth();
  if (!sessionExpired || signingIn) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismissSessionExpired();
      }}
    >
      <DialogContent className="max-w-xs">
        <div className="flex flex-col items-center gap-3 text-center">
          <DialogTitle className="text-[15px] font-semibold">
            Session expired
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-[13px]">
            Your Freestyle Cloud session has expired. Sign in again to keep
            using cloud voice and cleanup.
          </DialogDescription>

          <Button
            size="sm"
            className="mt-1 w-full"
            onClick={() => {
              void signIn();
            }}
          >
            Sign in again
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => dismissSessionExpired()}
          >
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
