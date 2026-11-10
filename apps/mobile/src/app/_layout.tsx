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
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Colors } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { ColorModeProvider, useColorMode } from "@/lib/color-mode";
import { OnboardingProvider, useOnboarding } from "@/lib/onboarding";
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

function RootNavigator() {
  const { scheme } = useColorMode();
  const theme = Colors[scheme];
  const { loading, signedIn } = useAuth();
  const { ready: onboardingReady } = useOnboarding();
  const startupReady = !loading && (!signedIn || onboardingReady);

  useEffect(() => {
    if (startupReady) {
      void SplashScreen.hideAsync();
    }
  }, [startupReady]);

  // Keep the native launch screen in place until the states that determine
  // the first route have both settled. This prevents a signed-in first-run
  // user from seeing the app shell before being sent to onboarding.
  if (!startupReady) return null;

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

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ColorModeProvider>
        <OnboardingProvider>
          <RootNavigator />
        </OnboardingProvider>
      </ColorModeProvider>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
