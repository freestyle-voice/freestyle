import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/hooks/use-auth";
import { EntriesProvider } from "@/lib/entries";
import { HistoryProvider } from "@/lib/history";
import { SettingsProvider } from "@/lib/settings";

/**
 * Authenticated area. A Stack hosts the bottom-tab group `(tabs)` plus the
 * pushed pages (settings, profile, keyboard setup, dictate). Because these
 * pages are pushed on top of the whole tab group, Back returns to whichever
 * tab was active — not always Home.
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
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="keyboard-setup" />
            <Stack.Screen
              name="dictate"
              options={{
                // Present as a full-screen modal so it sits above the tab
                // stack and pops off cleanly — the user always returns to
                // wherever they were (home, history, etc.), never to a stale
                // dictate screen left in the stack.
                presentation: "fullScreenModal",
              }}
            />
          </Stack>
        </HistoryProvider>
      </EntriesProvider>
    </SettingsProvider>
  );
}
