import { Redirect, Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

import { KeyboardDictationStrip } from "@/components/keyboard-dictation-strip";
import { useAuth } from "@/hooks/use-auth";
import { DismissiblesProvider } from "@/lib/dismissibles";
import { EntriesProvider } from "@/lib/entries";
import { HistoryProvider } from "@/lib/history";
import { KeyboardDictationProvider } from "@/lib/keyboard/keyboard-dictation-provider";
import { OnboardingProvider, useOnboarding } from "@/lib/onboarding";
import { SettingsProvider } from "@/lib/settings";

/**
 * Authenticated area. A Stack hosts the bottom-tab group `(tabs)` plus the
 * pushed pages (settings, profile, keyboard setup). The resident keyboard
 * dictation session lives in a provider here (not on any one screen) so it
 * survives across navigation — the whole point is that after the first
 * hand-off the user never has to return to a specific screen. A floating
 * status strip surfaces its state above whatever page is showing.
 */
export default function AppLayout() {
  const { signedIn, loading } = useAuth();

  // The root index shows the spinner during restore; once resolved, bounce
  // unauthenticated users back to sign-in.
  if (!loading && !signedIn) return <Redirect href="/sign-in" />;

  return (
    <SettingsProvider>
      <EntriesProvider>
        <HistoryProvider>
          <OnboardingProvider>
            <DismissiblesProvider>
              <KeyboardDictationProvider>
                <OnboardingGate />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="onboarding" />
                  <Stack.Screen name="settings" />
                  <Stack.Screen name="profile" />
                  <Stack.Screen name="keyboard-setup" />
                  <Stack.Screen name="billing" />
                </Stack>
                <KeyboardDictationStrip />
              </KeyboardDictationProvider>
            </DismissiblesProvider>
          </OnboardingProvider>
        </HistoryProvider>
      </EntriesProvider>
    </SettingsProvider>
  );
}

/**
 * Redirects first-run users to the wizard. Rendered under the providers so it
 * can read the onboarding flag; a no-op once complete. Uses imperative
 * navigation (not <Redirect>) so it doesn't fight the Stack's own screens.
 */
function OnboardingGate() {
  const { complete, ready } = useOnboarding();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!ready || complete) return;
    // Don't redirect if already on the onboarding screen.
    if (segments[segments.length - 1] === "onboarding") return;
    router.replace("/(app)/onboarding");
  }, [ready, complete, segments, router]);

  return null;
}
