import { SignInButton, SignInSplit } from "@renderer/components/sign-in-split";
import { useCloudAuth } from "@renderer/lib/auth-context";

export function LoginGate({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element | null {
  const { user, loading } = useCloudAuth();
  if (loading) return null;
  if (!user) return <LoginPage />;
  return <>{children}</>;
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
            : "Write with intelligence at your cursor"
        }
        error={error}
      >
        <SignInButton signingIn={signingIn} onClick={() => void signIn()} />
      </SignInSplit>
    </div>
  );
}
