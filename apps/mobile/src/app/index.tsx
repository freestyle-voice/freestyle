import { Redirect } from "expo-router";

import { useAuth } from "@/hooks/use-auth";
import { useOnboarding } from "@/lib/onboarding";
import { resolveStartupRoute } from "@/lib/startup-route";

export default function Index() {
  const { signedIn, loading } = useAuth();
  const { ready: onboardingReady, complete: onboardingComplete } =
    useOnboarding();
  const route = resolveStartupRoute({
    authLoading: loading,
    signedIn,
    onboardingReady,
    onboardingComplete,
  });

  // RootNavigator keeps the launch screen visible while this is unresolved.
  if (!route) return null;

  return <Redirect href={route} />;
}
