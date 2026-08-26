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
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Colors } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { openNotification } from "@/lib/cloud/notifications";
import { ColorModeProvider, useColorMode } from "@/lib/color-mode";
import { OnboardingProvider, useOnboarding } from "@/lib/onboarding";
import { queryClient } from "@/lib/query";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
  const { loading, signedIn, user } = useAuth();
  const router = useRouter();
  const { ready: onboardingReady } = useOnboarding();
  const startupReady = !loading && (!signedIn || onboardingReady);

  useEffect(() => {
    if (startupReady) {
      void SplashScreen.hideAsync();
    }
  }, [startupReady]);

  useEffect(() => {
    if (!signedIn || !user?.id) {
      queryClient.removeQueries({ queryKey: ["agent-notifications"] });
      queryClient.removeQueries({ queryKey: ["agent-notification-history"] });
      return;
    }
    queryClient.removeQueries({ queryKey: ["agent-notifications"] });
    queryClient.removeQueries({ queryKey: ["agent-notification-history"] });
    const appState = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      void queryClient.invalidateQueries({ queryKey: ["agent-notifications"] });
      void queryClient.invalidateQueries({
        queryKey: ["agent-notification-history"],
      });
    });
    return () => {
      appState.remove();
    };
  }, [signedIn, user?.id]);

  useEffect(() => {
    let active = true;
    const routePush = (response: Notifications.NotificationResponse | null) => {
      if (loading || !signedIn || !user?.id) return;
      const data = response?.notification.request.content.data;
      const threadId = data?.threadId;
      if (typeof threadId === "string") {
        router.push({
          pathname: "/(app)/agent-thread/[id]",
          params: { id: threadId },
        });
      }
      const notificationId = data?.notificationId;
      if (typeof notificationId === "string") {
        void openNotification(notificationId).catch(() => {});
      }
      if (response) void Notifications.clearLastNotificationResponseAsync();
    };
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (active) routePush(response);
    });
    const subscription =
      Notifications.addNotificationResponseReceivedListener(routePush);
    return () => {
      active = false;
      subscription.remove();
    };
  }, [loading, router, signedIn, user?.id]);

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ["agent-notifications"] });
      void queryClient.invalidateQueries({
        queryKey: ["agent-notification-history"],
      });
    });
    return () => subscription.remove();
  }, []);

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
