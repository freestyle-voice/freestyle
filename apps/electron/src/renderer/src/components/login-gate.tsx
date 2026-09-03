import { SignInButton, SignInSplit } from "@renderer/components/sign-in-split";
import { useCloudAuth } from "@renderer/lib/auth-context";

export function LoginGate({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element | null {
  const { user, loading } = useCloudAuth();
  // AppShell supplies a neutral, full-window signed-out frame while this
  // check runs. Keep protected content empty until we know whether the app or
  // sign-in screen belongs there; this avoids exposing user data during an
  // auth transition without briefly rendering the app sidebar.
  if (loading) return <StartupContentPlaceholder />;
  if (!user) return <LoginPage />;
  return <>{children}</>;
}

/**
 * The surrounding signed-out shell is already visible during auth
 * verification. This intentionally leaves it empty rather than rendering a
 * fake skeleton before the sign-in page or authenticated route mounts.
 */
function StartupContentPlaceholder(): React.JSX.Element {
  return <div className="min-h-0 flex-1" aria-busy="true" />;
}

/** The same page as onboarding's sign-in step, minus the step machinery. */
function LoginPage(): React.JSX.Element {
  const { signingIn, error, sessionExpired, signIn } = useCloudAuth();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
