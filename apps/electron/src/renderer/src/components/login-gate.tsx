import { SignInButton, SignInSplit } from "@renderer/components/sign-in-split";
import { useCloudAuth } from "@renderer/lib/auth-context";

export function LoginGate({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element | null {
  const { user, loading } = useCloudAuth();
  // AppShell remains mounted while this check runs, so the workspace switcher
  // and static navigation paint immediately. Keep the protected route content
  // empty until we know whether the signed-in app or sign-in screen belongs
  // there; this avoids exposing user data during an auth transition.
  if (loading) return <StartupContentPlaceholder />;
  if (!user) return <LoginPage />;
  return <>{children}</>;
}

/**
 * The surrounding AppShell is already visible during auth verification. This
 * intentionally occupies only its content pane, leaving no fake skeleton to
 * replace once the authenticated route mounts.
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
