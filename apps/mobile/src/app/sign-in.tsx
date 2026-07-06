import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import {
  type DeviceCodeResult,
  DeviceFlowError,
  DevicePendingError,
  pollDeviceToken,
  requestDeviceCode,
} from "@/lib/cloud/device-auth";

type Phase = "idle" | "starting" | "waiting" | "verifying" | "error";

export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signIn } = useAuth();

  const [phase, setPhase] = useState<Phase>("idle");
  const [code, setCode] = useState<DeviceCodeResult | null>(null);
  const [error, setError] = useState("");
  const cancelled = useRef(false);

  useEffect(() => {
    return () => {
      cancelled.current = true;
    };
  }, []);

  const poll = useCallback(
    async (device: DeviceCodeResult) => {
      let intervalMs = device.interval * 1000;
      const deadline = Date.now() + device.expires_in * 1000;

      while (!cancelled.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, intervalMs));
        if (cancelled.current) return;
        try {
          const token = await pollDeviceToken(device.device_code);
          setPhase("verifying");
          await signIn(token.access_token);
          if (!cancelled.current) router.replace("/(app)");
          return;
        } catch (err) {
          if (err instanceof DevicePendingError) {
            if (err.slowDown) intervalMs += 2000;
            continue;
          }
          if (err instanceof DeviceFlowError) {
            setError(err.message);
          } else {
            setError("Sign-in failed. Please try again.");
          }
          setPhase("error");
          return;
        }
      }
      if (!cancelled.current) {
        setError("Sign-in timed out. Please try again.");
        setPhase("error");
      }
    },
    [router, signIn],
  );

  const start = useCallback(async () => {
    setPhase("starting");
    setError("");
    try {
      const device = await requestDeviceCode();
      setCode(device);
      setPhase("waiting");
      const url = device.verification_uri_complete ?? device.verification_uri;
      await WebBrowser.openBrowserAsync(url);
      void poll(device);
    } catch {
      setError("Could not start sign-in. Check your connection.");
      setPhase("error");
    }
  }, [poll]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.hero}>
          <ThemedText type="eyebrow" themeColor="mutedForeground">
            Freestyle
          </ThemedText>
          <ThemedText type="display" style={styles.title}>
            <ThemedText type="displayItalic" themeColor="primary">
              speak
            </ThemedText>
            <ThemedText type="display">.</ThemedText>
          </ThemedText>
          <ThemedText themeColor="mutedForeground" style={styles.subtitle}>
            Voice typing that works everywhere. Sign in to your Freestyle
            account to start dictating.
          </ThemedText>
        </View>

        <View style={styles.footer}>
          {code && phase === "waiting" ? (
            <View
              style={[
                styles.codeCard,
                { borderColor: theme.border, backgroundColor: theme.card },
              ]}
            >
              <ThemedText type="eyebrow" themeColor="mutedForeground">
                Your code
              </ThemedText>
              <ThemedText style={[styles.code, { color: theme.foreground }]}>
                {code.user_code}
              </ThemedText>
              <View style={styles.waitingRow}>
                <ActivityIndicator color={theme.primary} size="small" />
                <ThemedText
                  themeColor="mutedForeground"
                  style={styles.waitingText}
                >
                  Waiting for approval in your browser…
                </ThemedText>
              </View>
            </View>
          ) : null}

          {phase === "error" ? (
            <ThemedText themeColor="destructive" style={styles.errorText}>
              {error}
            </ThemedText>
          ) : null}

          <Pressable
            onPress={start}
            disabled={
              phase === "starting" ||
              phase === "waiting" ||
              phase === "verifying"
            }
            style={[
              styles.button,
              {
                backgroundColor: theme.primary,
                opacity: phase === "waiting" ? 0.6 : 1,
              },
            ]}
          >
            {phase === "starting" || phase === "verifying" ? (
              <ActivityIndicator color={theme.primaryForeground} />
            ) : (
              <ThemedText
                style={[styles.buttonText, { color: theme.primaryForeground }]}
              >
                {phase === "error"
                  ? "Try again"
                  : phase === "waiting"
                    ? "Open browser again"
                    : "Sign in"}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    justifyContent: "space-between",
  },
  hero: { flex: 1, justifyContent: "center", gap: Spacing.two },
  title: { marginTop: Spacing.one },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    marginTop: Spacing.two,
    maxWidth: 320,
  },
  footer: { paddingBottom: Spacing.five, gap: Spacing.three },
  codeCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  code: { fontFamily: Fonts.mono, fontSize: 34, letterSpacing: 6 },
  waitingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  waitingText: { fontSize: 13 },
  errorText: { fontSize: 14, textAlign: "center" },
  button: {
    height: 54,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontFamily: Fonts.sansSemiBold, fontSize: 16 },
});
