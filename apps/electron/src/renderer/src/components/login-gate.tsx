import { SignInButton, SignInSplit } from "@renderer/components/sign-in-split";
import { useCloudAuth } from "@renderer/lib/auth-context";

export function LoginGate({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element | null {
  const { user, loading } = useCloudAuth();
  // While the first auth check is in flight, paint the neutral window frame
  // (draggable titlebar + glass surface) instead of a blank window, so the
  // panel appears instantly rather than looking unresponsive. We only know
  // whether to show the login page or the app once `loading` clears, so we
  // avoid flashing either here.
  if (loading) return <AuthLoadingFrame />;
  if (!user) return <LoginPage />;
  return <>{children}</>;
}

/**
 * A stable Dictate-shaped shell shown during the initial local auth check.
 * It makes cold starts feel immediate without exposing user data or briefly
 * showing Remix before the persisted workspace route has resolved.
 */
function AuthLoadingFrame(): React.JSX.Element {
  return (
    <div className="glass-window-shell flex h-screen min-h-0" aria-busy="true">
      <aside className="glass-sidebar flex w-[220px] shrink-0 flex-col border-r">
        <div
          className="h-8 shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
        <div className="remix-sidebar-titlebar px-5">
          <span className="font-serif text-[19px] text-foreground/90">
            Freestyle
          </span>
        </div>
        <div className="space-y-1 px-3 pt-3" aria-hidden="true">
          {["w-24", "w-28", "w-20", "w-24", "w-16"].map((width, index) => (
            <span
              key={`${width}-${index}`}
              className={`bg-muted/65 block h-8 rounded-[7px] ${width}`}
            />
          ))}
        </div>
      </aside>
      <main className="glass-content flex min-w-0 flex-1 flex-col">
        <div
          className="h-8 shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <span className="bg-primary/75 h-1.5 w-1.5 animate-pulse rounded-full" />
            <span className="text-muted-foreground text-[12px]">
              Starting Freestyle
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

/** The same page as onboarding's sign-in step, minus the step machinery. */
function LoginPage(): React.JSX.Element {
  const { signingIn, error, sessionExpired, signIn } = useCloudAuth();

  return (
    <div className="glass-window-shell glass-content flex h-screen flex-col">
      <div
        className="h-9 shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />
      <SignInSplit
        titlePrefix="Sign in to "
        subtitle={
          sessionExpired
            ? "Your session has expired. Sign in again to keep using Freestyle."
            : "Intelligence at your cursor"
        }
        error={error}
      >
        <SignInButton signingIn={signingIn} onClick={() => void signIn()} />
      </SignInSplit>
    </div>
  );
}
