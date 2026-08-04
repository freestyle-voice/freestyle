import demoVideo from "@renderer/assets/homer-odysseus-demo.mp4";
import markDark from "@renderer/assets/mark-dark.svg";
import markLight from "@renderer/assets/mark-light.svg";
import { ExternalLink, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// The sign-in screen: sign-in column on the left, the product demo on an ink
// panel on the right. Shared verbatim between onboarding's cloud step and the
// dashboard's login gate so the two read as the same page.
// ---------------------------------------------------------------------------

export function SignInSplit({
  titlePrefix,
  subtitle,
  error,
  children,
  footer,
}: {
  /** Leads into the italic "Freestyle" — "Welcome to " / "Sign in to ". */
  titlePrefix: string;
  subtitle: string;
  error: string | null;
  /** The action area under the subtitle (sign-in button, signed-in card…). */
  children: React.ReactNode;
  /** Optional extra content under the terms (e.g. the dev skip button). */
  footer?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="flex min-h-0 flex-1"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      {/* Left — sign in */}
      <div className="flex w-[44%] shrink-0 flex-col overflow-y-auto px-12 min-[1280px]:px-[72px]">
        <div className="flex w-full max-w-[400px] flex-1 flex-col justify-center py-8">
          <img
            src={markLight}
            alt="Freestyle"
            className="block h-11 w-11 dark:hidden"
          />
          <img
            src={markDark}
            alt="Freestyle"
            className="hidden h-11 w-11 dark:block"
          />

          <h1 className="serif text-foreground mt-9 mb-0 text-[52px] leading-[1.0] font-normal tracking-[-0.025em]">
            <span>{titlePrefix}</span>
            <span className="serif-italic text-primary">Freestyle</span>
          </h1>

          <p className="text-muted-foreground mt-4 max-w-[330px] text-[15px] leading-[1.55]">
            {subtitle}
          </p>

          {children}

          {error && (
            <p className="text-destructive mt-3 text-[12px] leading-snug">
              {error}
            </p>
          )}

          <p className="text-muted-foreground mt-5 max-w-[330px] text-[11px] leading-[1.7]">
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

          {footer}
        </div>
      </div>

      {/* Right — the product demo on an ink panel. Fixed dark values by
          design: it reads as a depiction, the same in both themes. */}
      <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-[#16140F] px-14 pt-14 pb-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(90% 70% at 70% 20%, rgba(138,182,42,0.10), transparent 60%)",
          }}
        />
        <div className="relative w-full max-w-[648px] rounded-[14px] border border-[#3A362D] bg-[#1E1C16] p-2 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.7)]">
          <video
            src={demoVideo}
            autoPlay
            loop
            muted
            playsInline
            aria-label="Freestyle Remix editing an Odyssey essay in a document by voice"
            className="block w-full rounded-[8px]"
          />
        </div>
        <div className="relative mt-[22px] flex items-center gap-2.5 text-[12.5px] text-[#9E977F]">
          <span>"Add a paragraph about Odysseus and the Sirens"</span>
        </div>
        <div className="absolute bottom-[22px] left-1/2 flex -translate-x-1/2 gap-[7px]">
          <span className="h-[5px] w-[18px] rounded-full bg-[#8AB62A]" />
          <span className="h-[5px] w-[5px] rounded-full bg-[#3A362D]" />
          <span className="h-[5px] w-[5px] rounded-full bg-[#3A362D]" />
          <span className="h-[5px] w-[5px] rounded-full bg-[#3A362D]" />
        </div>
      </div>
    </div>
  );
}

export function SignInButton({
  signingIn,
  onClick,
}: {
  signingIn: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={signingIn}
      className="bg-primary text-primary-foreground hover:bg-primary/90 mt-9 flex w-full items-center justify-center gap-2.5 rounded-[11px] px-5 py-3.5 text-[14.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-60"
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
  );
}
