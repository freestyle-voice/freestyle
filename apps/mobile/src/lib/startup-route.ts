export type StartupRoute = "/sign-in" | "/(app)/(tabs)" | "/(app)/onboarding";

interface StartupRouteInput {
  authLoading: boolean;
  signedIn: boolean;
  onboardingReady: boolean;
  onboardingComplete: boolean;
}

/**
 * Resolves the first route only after every state that can change it is known.
 * Returning null keeps the native launch screen visible instead of briefly
 * mounting a route which may immediately redirect.
 */
export function resolveStartupRoute({
  authLoading,
  signedIn,
  onboardingReady,
  onboardingComplete,
}: StartupRouteInput): StartupRoute | null {
  if (authLoading) return null;
  if (!signedIn) return "/sign-in";
  if (!onboardingReady) return null;

  return onboardingComplete ? "/(app)/(tabs)" : "/(app)/onboarding";
}
