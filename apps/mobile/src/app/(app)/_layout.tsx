import { Redirect, Tabs } from "expo-router";

import { FloatingTabBar } from "@/components/floating-tab-bar";
import { useAuth } from "@/hooks/use-auth";
import { EntriesProvider } from "@/lib/entries";
import { HistoryProvider } from "@/lib/history";
import { SettingsProvider } from "@/lib/settings";

export default function AppLayout() {
  const { signedIn, loading } = useAuth();

  // The root index shows the spinner during restore; once resolved, bounce
  // unauthenticated users back to sign-in.
  if (!loading && !signedIn) return <Redirect href="/sign-in" />;

  return (
    <SettingsProvider>
      <EntriesProvider>
        <HistoryProvider>
          <Tabs
            tabBar={(props) => <FloatingTabBar {...props} />}
            screenOptions={{ headerShown: false }}
          >
            <Tabs.Screen name="index" options={{ title: "Home" }} />
            <Tabs.Screen name="history" options={{ title: "History" }} />
            <Tabs.Screen name="vocabulary" options={{ title: "Vocab" }} />
            <Tabs.Screen name="tone" options={{ title: "Tone" }} />
            <Tabs.Screen name="dictionary" options={{ title: "Dict" }} />

            {/* Reachable by push/deep-link but not shown as nav tabs. */}
            <Tabs.Screen name="settings" options={{ href: null }} />
            <Tabs.Screen name="profile" options={{ href: null }} />
            <Tabs.Screen name="dictate" options={{ href: null }} />
            <Tabs.Screen name="keyboard-setup" options={{ href: null }} />
          </Tabs>
        </HistoryProvider>
      </EntriesProvider>
    </SettingsProvider>
  );
}
