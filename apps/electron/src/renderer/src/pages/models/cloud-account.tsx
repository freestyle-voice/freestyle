import { Button } from "@renderer/components/ui/button";
import { CheckCircle, Cloud, Loader2, LogOut } from "lucide-react";

import { Eyebrow } from "./page-chrome";
import type { UseCloudAuth } from "./use-cloud-auth";

// ---------------------------------------------------------------------------
// CloudAccountCard — Freestyle Cloud sign-in / signed-in identity / sign-out.
// ---------------------------------------------------------------------------

export function CloudAccountCard({
  auth,
}: {
  auth: UseCloudAuth;
}): React.JSX.Element {
  const { user, signingIn, userCode, signIn, signOut, error } = auth;

  return (
    <section className="border-border bg-card rounded-[12px] border p-4">
      <div className="mb-2.5">
        <Eyebrow text="Freestyle Cloud" />
      </div>
      {user ? (
        <div className="flex items-center gap-3">
          <CheckCircle className="text-primary h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-foreground truncate text-[13.5px] font-semibold">
              {user.name || user.email}
            </div>
            <div className="text-muted-foreground truncate text-[11px]">
              {user.email}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      ) : signingIn ? (
        <div className="flex items-center gap-3">
          <Loader2 className="text-muted-foreground h-4 w-4 shrink-0 animate-spin" />
          <div className="text-muted-foreground text-[13px]">
            Waiting for approval in your browser
            {userCode ? (
              <>
                {" · "}
                <span className="mono text-foreground tracking-[0.2em]">
                  {userCode}
                </span>
              </>
            ) : null}
            …
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Cloud className="text-muted-foreground h-4 w-4 shrink-0" />
          <div className="text-muted-foreground min-w-0 flex-1 text-[13px]">
            Sign in to use managed transcription — no API key needed.
          </div>
          <Button size="sm" onClick={() => void signIn()}>
            Sign in
          </Button>
        </div>
      )}
      {error ? (
        <p className="text-destructive mt-2 text-[11.5px]">{error}</p>
      ) : null}
    </section>
  );
}
