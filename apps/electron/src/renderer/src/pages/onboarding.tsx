import { SetupChecklist } from "@renderer/components/onboarding/setup-checklist";
import { Button } from "@renderer/components/ui/button";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { useOnboarding } from "@renderer/lib/onboarding-state";
import {
  ArrowLeft,
  ArrowRight,
  Cloud,
  ExternalLink,
  HardDrive,
  Loader2,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

const ModelsPage = lazy(() => import("./models"));
type OnboardingLocationState = { from?: string } | null;

/** First-run setup remains outside the normal workspace and settings shell. */
export default function OnboardingPage(): React.JSX.Element {
  const auth = useCloudAuth();
  const onboarding = useOnboarding(auth.phase === "authenticated");
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const attempt = useRef(0);
  const [setupReady, setSetupReady] = useState(false);
  const path = params.get("setup");
  const settingUp = path === "cloud" || path === "local";
  const choosingModel = settingUp && params.get("view") === "models";
  const from = (location.state as OnboardingLocationState)?.from;
  const destination = from && from !== "/onboarding" ? from : "/today";

  useEffect(() => {
    if (onboarding.status === "done") navigate(destination, { replace: true });
  }, [destination, navigate, onboarding.status]);

  const changeStep = (next: Record<string, string>) => {
    attempt.current++;
    setSetupReady(false);
    if (auth.signingIn) auth.cancelSignIn();
    setParams(next, { state: location.state });
  };
  const chooseCloud = async () => {
    const currentAttempt = ++attempt.current;
    const user = auth.user ?? (await auth.signIn());
    if (user && currentAttempt === attempt.current) {
      setParams({ setup: "cloud" }, { state: location.state });
    }
  };
  const finish = async () => {
    if (auth.signingIn) auth.cancelSignIn();
    await onboarding.markDone();
  };

  if (onboarding.status === "loading")
    return (
      <div
        role="status"
        className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm"
      >
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Loading your setup…
      </div>
    );

  if (onboarding.loadError)
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md">
          <h1 className="serif text-3xl">Couldn’t load your setup</h1>
          <p role="alert" className="text-muted-foreground text-sm">
            Your saved choices haven’t been changed. Check your connection to
            the app and try again.
          </p>
          <Button onClick={onboarding.retryLoad}>Retry loading setup</Button>
        </div>
      </div>
    );

  if (choosingModel)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-border flex shrink-0 flex-wrap items-center gap-3 border-b px-6 py-3">
          <Button variant="outline" onClick={() => changeStep({ setup: path })}>
            <ArrowLeft aria-hidden="true" />
            Back to setup
          </Button>
          <p className="text-muted-foreground m-0 text-sm">
            Choose a transcription model, then return to check your setup.
          </p>
        </div>
        <div className="min-h-0 flex-1">
          <Suspense
            fallback={
              <p role="status" className="p-6 text-sm">
                Loading models…
              </p>
            }
          >
            <ModelsPage />
          </Suspense>
        </div>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto px-6 py-8 sm:px-10 sm:py-10">
      <section className="mx-auto my-auto flex w-full max-w-3xl flex-col gap-6">
        <header>
          <p className="mono text-primary mb-3 text-[10px] font-semibold tracking-[0.16em] uppercase">
            {settingUp ? "Get ready to dictate" : "Welcome to Freestyle"}
          </p>
          <h1 className="serif text-foreground m-0 text-[36px] font-normal leading-[1.08] tracking-[-0.025em] sm:text-[44px]">
            {settingUp ? (
              "A few checks, then your first words."
            ) : (
              <>
                Let’s get you ready to{" "}
                <span className="serif-italic text-primary">dictate.</span>
              </>
            )}
          </h1>
          <p className="text-muted-foreground mt-3 mb-0 max-w-xl text-sm leading-6">
            {settingUp
              ? "Check your model and permissions, then try your shortcut. You can finish later in Settings → Models and Permissions."
              : "Choose how to transcribe your voice. Next, we’ll check permissions and help you try your first dictation."}
          </p>
        </header>
        {settingUp ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => changeStep({})}>
                <ArrowLeft aria-hidden="true" />
                Change setup path
              </Button>
              <span className="text-muted-foreground text-xs">
                {path === "cloud"
                  ? "Freestyle Cloud setup"
                  : "Local models & your API keys"}
              </span>
            </div>
            <SetupChecklist
              onReadyChange={setSetupReady}
              path={path === "cloud" ? "cloud" : "local"}
              onChooseModel={() => changeStep({ setup: path, view: "models" })}
            />
            {onboarding.error && (
              <p role="alert" className="text-destructive m-0 text-sm">
                {onboarding.error}
              </p>
            )}
            <footer className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <p className="text-muted-foreground m-0 max-w-sm text-xs leading-5">
                Remix is also available when you want to rewrite, research or
                act on an idea. Explore it after setup.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  disabled={onboarding.saving}
                  onClick={() => void finish()}
                >
                  Finish setup later
                </Button>
                <Button
                  disabled={
                    onboarding.saving || (!setupReady && !onboarding.error)
                  }
                  onClick={() => void finish()}
                >
                  {onboarding.saving ? (
                    <>
                      <Loader2
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                      Saving setup…
                    </>
                  ) : onboarding.error ? (
                    "Retry saving setup"
                  ) : (
                    "Open Freestyle"
                  )}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </footer>
          </>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <article className="border-border bg-card/55 flex min-w-0 flex-col rounded-xl border p-5 sm:p-6">
                <Cloud
                  aria-hidden="true"
                  className="text-primary mb-4 size-5"
                />
                <h2 className="m-0 text-base font-medium">
                  Use Freestyle Cloud
                </h2>
                <p className="text-muted-foreground mt-2 mb-5 text-sm leading-6">
                  Sign in to use managed transcription and cleanup. Your audio
                  is sent to Freestyle Cloud for processing.
                </p>
                <Button
                  className="mt-auto h-auto min-h-10 whitespace-normal py-2"
                  disabled={auth.signingIn || auth.loading}
                  onClick={() => void chooseCloud()}
                >
                  {auth.signingIn ? (
                    <>
                      <Loader2
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                      Waiting for sign-in…
                    </>
                  ) : auth.user ? (
                    <>
                      Continue with Freestyle Cloud
                      <ArrowRight aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      {auth.error
                        ? "Try signing in again"
                        : "Sign in with your browser"}
                      <ExternalLink aria-hidden="true" />
                    </>
                  )}
                </Button>
                <p className="text-muted-foreground mt-2 mb-0 min-h-10 text-xs leading-5">
                  {auth.user
                    ? "You’re signed in. Next: check your dictation setup."
                    : "Your browser opens for sign-in. Return here when you’re done."}
                </p>
              </article>
              <article className="border-border bg-card/55 flex min-w-0 flex-col rounded-xl border p-5 sm:p-6">
                <HardDrive
                  aria-hidden="true"
                  className="text-primary mb-4 size-5"
                />
                <h2 className="m-0 text-base font-medium">
                  Use local models or your API keys
                </h2>
                <p className="text-muted-foreground mt-2 mb-5 text-sm leading-6">
                  Download a model to transcribe on this device, or connect a
                  provider using your own key. No Freestyle account needed.
                </p>
                <Button
                  variant="outline"
                  className="mt-auto h-auto min-h-10 whitespace-normal py-2"
                  onClick={() => changeStep({ setup: "local" })}
                >
                  Set up local models or API keys
                  <ArrowRight aria-hidden="true" />
                </Button>
                <p className="text-muted-foreground mt-2 mb-0 min-h-10 text-xs leading-5">
                  Next: choose your model and check permissions.
                </p>
              </article>
            </div>
            {auth.error && (
              <p role="alert" className="text-destructive m-0 text-sm">
                {auth.error} Try signing in again, or set up local models or
                your own API keys.
              </p>
            )}
            <p className="text-muted-foreground m-0 text-xs leading-5">
              You can change models at any time in Settings. Remix helps you
              rewrite, research and take action when you need it.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
