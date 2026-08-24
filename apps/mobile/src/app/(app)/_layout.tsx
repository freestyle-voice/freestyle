import { Redirect, Stack, useSegments } from "expo-router";

import { KeyboardDictationStrip } from "@/components/keyboard-dictation-strip";
import { useAuth } from "@/hooks/use-auth";
import { DismissiblesProvider } from "@/lib/dismissibles";
import { EntriesProvider } from "@/lib/entries";
import { HistoryProvider } from "@/lib/history";
import { KeyboardDictationProvider } from "@/lib/keyboard/keyboard-dictation-provider";
import { useOnboarding } from "@/lib/onboarding";
import { SettingsProvider } from "@/lib/settings";

/**
 * Authenticated area. A Stack hosts the chat-home group `(tabs)` plus the
 * pushed pages (settings, profile, keyboard setup). The resident keyboard
 * dictation session lives in a provider here (not on any one screen) so it
 * survives across navigation — the whole point is that after the first
 * hand-off the user never has to return to a specific screen. A floating
 * status strip surfaces its state above whatever page is showing.
 */
export default function AppLayout() {
  const { signedIn, loading } = useAuth();
  const { complete: onboardingComplete, ready: onboardingReady } =
    useOnboarding();
  const segments = useSegments();
  const onOnboardingScreen = segments[segments.length - 1] === "onboarding";

  // Keep direct links and post-sign-in navigation from briefly mounting the
  // app shell before the local onboarding state has hydrated.
  if (loading || (signedIn && !onboardingReady)) return null;

  if (!loading && !signedIn) return <Redirect href="/sign-in" />;
  if (!onboardingComplete && !onOnboardingScreen) {
    return <Redirect href="/(app)/onboarding" />;
  }

  return (
    <SettingsProvider>
      <EntriesProvider>
        <HistoryProvider>
          <DismissiblesProvider>
            <KeyboardDictationProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="settings" />
                <Stack.Screen name="profile" />
                <Stack.Screen name="history" />
                <Stack.Screen name="vocabulary" />
                <Stack.Screen name="dictionary" />
                <Stack.Screen name="tone" />
                <Stack.Screen name="keyboard-setup" />
                <Stack.Screen name="help" />
                <Stack.Screen name="billing" />
                <Stack.Screen name="connected-apps" />
                <Stack.Screen name="automations" />
                <Stack.Screen name="notifications" />
                <Stack.Screen name="agent-thread/[id]" />
              </Stack>
              <KeyboardDictationStrip />
            </KeyboardDictationProvider>
          </DismissiblesProvider>
        </HistoryProvider>
      </EntriesProvider>
    </SettingsProvider>
  );
}
