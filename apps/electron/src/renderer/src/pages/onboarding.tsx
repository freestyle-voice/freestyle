import { Button } from "@renderer/components/ui/button";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { useOnboarding } from "@renderer/lib/onboarding-state";
import { ArrowRight, Mic, Wand2 } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

type OnboardingLocationState = { from?: string } | null;

/** First-run orientation for Freestyle as a whole, deliberately outside Remix. */
export default function OnboardingPage(): React.JSX.Element {
  const { user } = useCloudAuth();
  const onboarding = useOnboarding(Boolean(user));
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as OnboardingLocationState)?.from;
  const destination = from && from !== "/onboarding" ? from : "/today";

  useEffect(() => {
    if (onboarding.status === "done") navigate(destination, { replace: true });
  }, [destination, navigate, onboarding.status]);

  if (onboarding.status === "loading" || !user) {
    return <div aria-busy="true" className="flex min-h-0 flex-1" />;
  }

  const continueToFreestyle = (): void => {
    onboarding.markDone();
    navigate(destination, { replace: true });
  };

  return (
    <main className="flex min-h-0 flex-1 items-center overflow-y-auto px-6 py-10 sm:px-10">
      <section className="mx-auto grid w-full max-w-3xl gap-8">
        <div className="max-w-xl">
          <p className="mono text-primary mb-3 text-[10px] font-semibold tracking-[0.16em] uppercase">
            Welcome to Freestyle
          </p>
          <h1 className="serif text-foreground m-0 text-[48px] font-normal leading-[0.95] tracking-[-0.025em] sm:text-[58px]">
            Start with your{" "}
            <span className="serif-italic text-primary">voice.</span>
          </h1>
          <p className="text-muted-foreground mt-4 max-w-lg text-[15px] leading-6">
            Dictate wherever you work. When you need help shaping or acting on
            an idea, open Remix. You can adjust everything later in Settings.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-xl border border-border/70 bg-card/55 p-5">
            <Mic className="text-primary mb-5 size-5" aria-hidden="true" />
            <h2 className="text-foreground m-0 text-base font-medium">
              Dictate anywhere
            </h2>
            <p className="text-muted-foreground mt-2 mb-0 text-sm leading-5">
              Press your dictation shortcut, speak naturally, and Freestyle puts
              the words where you need them.
            </p>
          </article>
          <article className="rounded-xl border border-border/70 bg-card/55 p-5">
            <Wand2 className="text-primary mb-5 size-5" aria-hidden="true" />
            <h2 className="text-foreground m-0 text-base font-medium">
              Use Remix when it helps
            </h2>
            <p className="text-muted-foreground mt-2 mb-0 text-sm leading-5">
              Remix is ready when you want to rewrite, research, plan, or take
              an approved action.
            </p>
          </article>
        </div>

        <div>
          <Button size="lg" onClick={continueToFreestyle}>
            Continue to Freestyle
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </section>
    </main>
  );
}
