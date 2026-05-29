import { AudioModule } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { addModelConfig, setSetting } from "@/lib/db";
import {
  PROVIDERS,
  type ProviderId,
  setApiKey,
  VOICE_MODELS,
} from "@/lib/storage";

type Step = "welcome" | "provider" | "apikey" | "mic" | "done";

export default function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(
    null,
  );
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [micGranted, setMicGranted] = useState(false);

  const voiceProviders = PROVIDERS.filter((p) =>
    VOICE_MODELS.some((m) => m.provider === p.id),
  );

  const handleProviderSelect = (id: ProviderId) => {
    setSelectedProvider(id);
    setStep("apikey");
  };

  const handleApiKeySave = async () => {
    if (!apiKeyInput.trim() || !selectedProvider) return;

    await setApiKey(selectedProvider, apiKeyInput.trim());

    const defaultModel = VOICE_MODELS.find(
      (m) => m.provider === selectedProvider,
    );
    if (defaultModel) {
      await addModelConfig({
        provider: defaultModel.provider,
        model_id: defaultModel.model_id,
        model_name: defaultModel.model_name,
        type: "voice",
        is_default: true,
      });
    }

    setStep("mic");
  };

  const handleMicPermission = async () => {
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    setMicGranted(granted);
    if (granted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("done");
    } else {
      Alert.alert(
        "Microphone Required",
        "Freestyle needs microphone access to transcribe your voice. You can enable it in your device settings.",
        [
          { text: "Skip", onPress: () => setStep("done") },
          { text: "Try Again", onPress: handleMicPermission },
        ],
      );
    }
  };

  const handleFinish = useCallback(async () => {
    await setSetting("onboarding_complete", "true");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)");
  }, [router]);

  const providerPlaceholder =
    PROVIDERS.find((p) => p.id === selectedProvider)?.keyPlaceholder ?? "";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {step === "welcome" && (
        <View style={styles.stepContent}>
          <View style={styles.centerSection}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: theme.primaryLight },
              ]}
            >
              <Icon name="wand" size={40} color={theme.primary} />
            </View>
            <ThemedText type="title" style={styles.welcomeTitle}>
              Freestyle
            </ThemedText>
            <ThemedText
              themeColor="textSecondary"
              style={styles.welcomeSubtitle}
            >
              Voice to text, everywhere.{"\n"}Speak naturally, get polished
              text.
            </ThemedText>
          </View>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={() => setStep("provider")}
          >
            <ThemedText style={styles.primaryButtonText}>
              Get Started
            </ThemedText>
            <Icon name="chevronRight" size={18} color="#FFF" />
          </Pressable>
        </View>
      )}

      {step === "provider" && (
        <View style={styles.stepContent}>
          <View style={styles.stepHeader}>
            <ThemedText type="subtitle">Choose a Provider</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.stepDesc}>
              Select which AI service will transcribe your voice.
            </ThemedText>
          </View>

          <View style={styles.providerList}>
            {voiceProviders.map((provider) => (
              <Pressable
                key={provider.id}
                style={[
                  styles.providerOption,
                  {
                    backgroundColor: theme.cardBackground,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => handleProviderSelect(provider.id)}
              >
                <View
                  style={[
                    styles.providerIcon,
                    { backgroundColor: theme.primaryLight },
                  ]}
                >
                  <Icon name="key" size={18} color={theme.primary} />
                </View>
                <View style={styles.providerInfo}>
                  <ThemedText style={{ fontWeight: "600" }}>
                    {provider.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {provider.description}
                  </ThemedText>
                </View>
                <Icon
                  name="chevronRight"
                  size={18}
                  color={theme.textTertiary}
                />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {step === "apikey" && (
        <View style={styles.stepContent}>
          <View style={styles.stepHeader}>
            <ThemedText type="subtitle">Add API Key</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.stepDesc}>
              Enter your{" "}
              {PROVIDERS.find((p) => p.id === selectedProvider)?.name} API key.
              Your key is stored securely on your device.
            </ThemedText>
          </View>

          <TextInput
            style={[
              styles.apiKeyInput,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
            placeholder={providerPlaceholder}
            placeholderTextColor={theme.textTertiary}
            value={apiKeyInput}
            onChangeText={setApiKeyInput}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <View style={styles.buttonRow}>
            <Pressable
              style={[
                styles.secondaryButton,
                { backgroundColor: theme.backgroundElement },
              ]}
              onPress={() => {
                setStep("provider");
                setApiKeyInput("");
              }}
            >
              <ThemedText style={{ fontSize: 15 }}>Back</ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.primaryButton,
                {
                  flex: 1,
                  backgroundColor: apiKeyInput.trim()
                    ? theme.primary
                    : theme.backgroundElement,
                },
              ]}
              onPress={handleApiKeySave}
              disabled={!apiKeyInput.trim()}
            >
              <ThemedText
                style={[
                  styles.primaryButtonText,
                  !apiKeyInput.trim() && { color: theme.textTertiary },
                ]}
              >
                Continue
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      {step === "mic" && (
        <View style={styles.stepContent}>
          <View style={styles.centerSection}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: theme.primaryLight },
              ]}
            >
              <Icon name="mic" size={40} color={theme.primary} />
            </View>
            <ThemedText type="subtitle" style={{ textAlign: "center" }}>
              Microphone Access
            </ThemedText>
            <ThemedText
              themeColor="textSecondary"
              style={styles.welcomeSubtitle}
            >
              Freestyle needs access to your microphone to transcribe your
              voice.
            </ThemedText>
          </View>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={handleMicPermission}
          >
            <Icon name="mic" size={18} color="#FFF" />
            <ThemedText style={styles.primaryButtonText}>
              Allow Microphone
            </ThemedText>
          </Pressable>
        </View>
      )}

      {step === "done" && (
        <View style={styles.stepContent}>
          <View style={styles.centerSection}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: theme.successLight },
              ]}
            >
              <Icon name="check" size={40} color={theme.success} />
            </View>
            <ThemedText type="subtitle" style={{ textAlign: "center" }}>
              You're all set!
            </ThemedText>
            <ThemedText
              themeColor="textSecondary"
              style={styles.welcomeSubtitle}
            >
              Hold the microphone button to record, then release to transcribe.
            </ThemedText>
          </View>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={handleFinish}
          >
            <ThemedText style={styles.primaryButtonText}>
              Start Using Freestyle
            </ThemedText>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stepContent: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    justifyContent: "space-between",
  },
  centerSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.three,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.two,
  },
  welcomeTitle: {
    fontSize: 36,
    fontWeight: "400",
    fontStyle: "italic",
    textAlign: "center",
  },
  welcomeSubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 23,
    paddingHorizontal: Spacing.four,
  },
  stepHeader: {
    paddingTop: Spacing.five,
    gap: Spacing.one,
    marginBottom: Spacing.four,
  },
  stepDesc: {
    fontSize: 14,
    lineHeight: 22,
  },
  providerList: {
    flex: 1,
    gap: Spacing.two,
  },
  providerOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.three,
    borderRadius: 11,
    borderWidth: 1,
    gap: Spacing.three,
  },
  providerIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  providerInfo: {
    flex: 1,
  },
  apiKeyInput: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 13,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: "auto",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Radius.xl,
  },
  primaryButtonText: {
    color: "#FBF8EE",
    fontSize: 15,
    fontWeight: "500",
  },
  secondaryButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
});
