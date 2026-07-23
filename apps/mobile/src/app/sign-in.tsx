import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { type SocialProvider, useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useColorMode } from "@/lib/color-mode";

const PROVIDER_LABELS: Record<SocialProvider, string> = {
  apple: "Continue with Apple",
  google: "Continue with Google",
  github: "Continue with GitHub",
};

// Present providers in the order each platform's users expect: Apple first on
// iOS, Google first on Android. GitHub always trails. On iOS the Apple option
// renders as Apple's official native button (HIG requirement), so it's excluded
// from the generic list here and rendered separately.
const PROVIDER_ORDER: SocialProvider[] = Platform.select({
  ios: ["google", "github"],
  default: ["google", "apple", "github"],
});

export default function SignInScreen() {
  const router = useRouter();
  const { signInWith } = useAuth();
  const { scheme } = useColorMode();

  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState("");

  const handleSignIn = useCallback(
    async (provider: SocialProvider) => {
      setPending(provider);
      setError("");
      const { error: err } = await signInWith(provider);
      setPending(null);
      if (err) {
        setError(err);
        return;
      }
      // On native the session resolves reactively; route once it's set.
      router.replace("/(app)/(tabs)");
    },
    [signInWith, router],
  );

  const isIOS = Platform.OS === "ios";

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
          {error ? (
            <ThemedText themeColor="destructive" style={styles.errorText}>
              {error}
            </ThemedText>
          ) : null}

          {isIOS ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
              }
              buttonStyle={
                scheme === "dark"
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={999}
              style={styles.appleButton}
              onPress={() => handleSignIn("apple")}
            />
          ) : null}

          {PROVIDER_ORDER.map((provider, index) => (
            <ProviderButton
              key={provider}
              label={PROVIDER_LABELS[provider]}
              onPress={() => handleSignIn(provider)}
              loading={pending === provider}
              disabled={pending !== null}
              variant={!isIOS && index === 0 ? "primary" : "outline"}
            />
          ))}

          <ThemedText themeColor="mutedForeground" style={styles.legal}>
            We only use your account to sync credits and preferences.
          </ThemedText>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function ProviderButton({
  label,
  onPress,
  loading,
  disabled,
  variant,
}: {
  label: string;
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
  variant: "primary" | "outline";
}) {
  const theme = useTheme();
  const primary = variant === "primary";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        primary
          ? { backgroundColor: theme.primary }
          : { borderWidth: 1, borderColor: theme.border },
        disabled && !loading ? styles.buttonDisabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={primary ? theme.primaryForeground : theme.foreground}
        />
      ) : (
        <ThemedText
          style={[
            styles.buttonText,
            { color: primary ? theme.primaryForeground : theme.foreground },
          ]}
        >
          {label}
        </ThemedText>
      )}
    </Pressable>
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
  footer: { paddingBottom: Spacing.five, gap: Spacing.two },
  errorText: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing.one,
  },
  button: {
    height: 54,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  appleButton: { height: 54, width: "100%" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontFamily: Fonts.sansSemiBold, fontSize: 16 },
  legal: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: Spacing.two,
  },
});
