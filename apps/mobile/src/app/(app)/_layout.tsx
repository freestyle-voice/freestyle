import { Redirect, Stack } from "expo-router";

import { KeyboardDictationStrip } from "@/components/keyboard-dictation-strip";
import { useAuth } from "@/hooks/use-auth";
import { EntriesProvider } from "@/lib/entries";
import { HistoryProvider } from "@/lib/history";
import { KeyboardDictationProvider } from "@/lib/keyboard/keyboard-dictation-provider";
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
          <KeyboardDictationProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="profile" />
              <Stack.Screen name="keyboard-setup" />
            </Stack>
            <KeyboardDictationStrip />
          </KeyboardDictationProvider>
        </HistoryProvider>
      </EntriesProvider>
    </SettingsProvider>
  );
}
