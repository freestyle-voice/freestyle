import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
} from "@expo-google-fonts/dm-sans";
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from "@expo-google-fonts/instrument-serif";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { isRunningInExpoGo } from "expo";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Colors } from "@/constants/theme";
import { ColorModeProvider, useColorMode } from "@/lib/color-mode";
import { queryClient } from "@/lib/query";

Sentry.init({
  dsn: "https://51fcf17635446e0a220b3ff41b266821@o4509750817325057.ingest.us.sentry.io/4511780563124224",

  sendDefaultPii: true,

  // Tracing
  tracesSampleRate: 1.0,

  integrations: [
    Sentry.reactNavigationIntegration({
      enableTimeToInitialDisplay: !isRunningInExpoGo(),
    }),
    Sentry.mobileReplayIntegration({
      maskAllText: true,
      maskAllImages: true,
      maskAllVectors: true,
    }),
  ],

  enableNativeFramesTracking: !isRunningInExpoGo(),

  // Session Replay
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,

  // Logs
  enableLogs: true,
});

SplashScreen.preventAutoHideAsync();

/**
 * Handles the keyboard's `freestyle://dictate` deep link.
 *
 * The iOS keyboard extension can't use the mic, so its mic button opens the app
 * via this deep link (the only mechanism that reliably launches the host app
 * from a keyboard on iOS 18+). The keyboard also writes a `start` command into
 * the shared App Group before opening us.
 *
 * The resident session lives in `KeyboardDictationProvider` (mounted under the
 * authenticated `(app)` group), and it drains that `start` command on its own —
 * via the `onCommand` event, a poll, and an AppState "active" sweep. So all this
 * handler has to do is make sure we land inside the app group (not on sign-in),
 * where the provider is mounted. It intentionally does NOT navigate to a
 * dedicated dictate screen anymore: the session is global, and a floating status
 * strip surfaces it wherever the user is. This is what removes the old
 * "opens a separate recording page every time" behavior.
 */
function useDictationDeepLink() {
  useEffect(() => {
    function handle(url: string | null) {
      if (!url) return;
      const { hostname, path } = Linking.parse(url);
      const target = hostname ?? path?.replace(/^\/+/, "");
      if (target !== "dictate") return;
      // Ensure we're inside the authenticated app group so the provider (which
      // owns the resident session) is mounted and can pick up the `start`
      // command. If the user isn't signed in, the (app) layout redirects to
      // sign-in on its own.
      router.replace("/(app)/(tabs)");
    }

    // Cold start: the URL that launched the app (if any).
    Linking.getInitialURL().then(handle);

    // Warm start: the app is already running when the link arrives.
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => sub.remove();
  }, []);
}

function RootNavigator() {
  const { scheme } = useColorMode();
  const theme = Colors[scheme];

  useDictationDeepLink();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}
      />
    </GestureHandlerRootView>
  );
}

function RootLayout() {
  const [fontsLoaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    JetBrainsMono_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ColorModeProvider>
        <RootNavigator />
      </ColorModeProvider>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
