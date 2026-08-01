import markDark from "@renderer/assets/mark-dark.svg";
import markLight from "@renderer/assets/mark-light.svg";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

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

function LoginPage(): React.JSX.Element {
  const { signingIn, error, sessionExpired, signIn } = useCloudAuth();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => window.api?.onFullscreenChanged(setIsFullscreen), []);

  return (
    <div className="glass-window-shell glass-content flex h-screen flex-col">
      {!isFullscreen && (
        <div
          className="h-9 shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
      )}

      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-6 py-8"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div className="flex w-full max-w-[420px] flex-col items-center text-center">
          <img
            src={markLight}
            alt="Freestyle"
            className="block h-14 w-14 dark:hidden"
          />
          <img
            src={markDark}
            alt="Freestyle"
            className="hidden h-14 w-14 dark:block"
          />

          <h1 className="serif text-foreground mt-6 mb-0 text-[44px] leading-[1.0] font-normal tracking-[-0.025em]">
            <span>Sign in to </span>
            <span className="serif-italic text-primary">Freestyle</span>
          </h1>

          <p className="text-muted-foreground mt-3 max-w-[340px] text-[14px] leading-relaxed">
            {sessionExpired
              ? "Your session has expired. Sign in again to keep using Freestyle."
              : "Sign in to your account to continue."}
          </p>

          <button
            type="button"
            onClick={() => void signIn()}
            disabled={signingIn}
            className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-[11px] bg-primary px-5 py-3 text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60"
          >
            {signingIn ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Opening browser…
              </>
            ) : (
              <>
                Sign in via browser
                <ExternalLink className="size-4 opacity-70" />
              </>
            )}
          </button>

          {error && (
            <p className="text-destructive mt-3 text-[12px] leading-snug">
              {error}
            </p>
          )}
        </div>
      </div>

      <p className="text-muted-foreground shrink-0 px-6 pb-8 text-center text-[11px] leading-[1.7]">
        By continuing, you agree to our{" "}
        <a
          href="https://freestylevoice.com/terms"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-2"
        >
          Terms of Service
        </a>{" "}
        and{" "}
        <a
          href="https://freestylevoice.com/privacy"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-2"
        >
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
