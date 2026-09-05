import { SignInButton, SignInSplit } from "@renderer/components/sign-in-split";
import { useCloudAuth } from "@renderer/lib/auth-context";

export function LoginGate({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element | null {
  const { phase } = useCloudAuth();
  if (phase === "signed_out") return <LoginPage />;
  return <>{children}</>;
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
