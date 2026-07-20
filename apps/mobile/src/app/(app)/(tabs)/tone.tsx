import { Sparkles } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import {
  Card,
  Divider,
  OptionCard,
  SectionTitle,
  TabScreenScaffold,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  EMAIL_TONE_OPTIONS,
  INTENSITY_OPTIONS,
  OVERALL_TONE_OPTIONS,
  PERSONAL_TONE_OPTIONS,
  WORK_TONE_OPTIONS,
} from "@/lib/cleanup-tones";
import { useSettings } from "@/lib/settings";

const CUSTOM_PROMPT_MAX = 2000;

export default function ToneScreen() {
  const theme = useTheme();
  const {
    settings,
    setCleanup,
    setIntensity,
    setCustomPrompt,
    setPersonalTone,
    setWorkTone,
    setEmailTone,
    setOverallTone,
  } = useSettings();

  // Local draft for the custom prompt so typing doesn't thrash storage; commit
  // on blur. Seeded from the persisted value.
  const [draftPrompt, setDraftPrompt] = useState(settings.customPrompt);

  return (
    <TabScreenScaffold
      title="Cleanup & Tone"
      subtitle="Control how much Freestyle polishes your words, and the voice it uses for each kind of writing."
    >
      {/* Cleanup on/off */}
      <Card>
        <SectionTitle icon={Sparkles} title="Cleanup" />
        <OptionCard
          label="Polish my words"
          hint="Removes filler and fixes punctuation with AI."
          selected={settings.cleanup}
          onPress={() => setCleanup(true)}
        />
        <OptionCard
          label="Raw transcript"
          hint="Keep exactly what I said, unedited."
          selected={!settings.cleanup}
          onPress={() => setCleanup(false)}
        />
      </Card>

      {settings.cleanup ? (
        <>
          {/* Intensity */}
          <Card>
            <SectionTitle icon={Sparkles} title="Intensity" />
            {INTENSITY_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                hint={opt.hint}
                selected={settings.intensity === opt.value}
                onPress={() => setIntensity(opt.value)}
              />
            ))}

            {settings.intensity === "custom" ? (
              <>
                <Divider />
                <View style={styles.promptBlock}>
                  <ThemedText type="eyebrow" themeColor="mutedForeground">
                    Custom instructions
                  </ThemedText>
                  <TextInput
                    value={draftPrompt}
                    onChangeText={setDraftPrompt}
                    onBlur={() => setCustomPrompt(draftPrompt)}
                    multiline
                    maxLength={CUSTOM_PROMPT_MAX}
                    placeholder="e.g. Keep my slang, format lists as bullet points, never add greetings."
                    placeholderTextColor={theme.mutedForeground}
                    style={[
                      styles.promptInput,
                      {
                        color: theme.foreground,
                        borderColor: theme.border,
                        backgroundColor: theme.background,
                      },
                    ]}
                  />
                  <ThemedText
                    themeColor="mutedForeground"
                    style={styles.charCount}
                  >
                    {draftPrompt.length} / {CUSTOM_PROMPT_MAX}
                  </ThemedText>
                </View>
              </>
            ) : null}
          </Card>

          {/* Tone by destination */}
          <Card>
            <SectionTitle icon={Sparkles} title="Everything else" />
            {OVERALL_TONE_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                hint={opt.hint}
                selected={settings.overallTone === opt.value}
                onPress={() => setOverallTone(opt.value)}
              />
            ))}
          </Card>

          <Card>
            <SectionTitle icon={Sparkles} title="Personal messages" />
            {PERSONAL_TONE_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                hint={opt.hint}
                selected={settings.personalTone === opt.value}
                onPress={() => setPersonalTone(opt.value)}
              />
            ))}
          </Card>

          <Card>
            <SectionTitle icon={Sparkles} title="Work chats" />
            {WORK_TONE_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                hint={opt.hint}
                selected={settings.workTone === opt.value}
                onPress={() => setWorkTone(opt.value)}
              />
            ))}
          </Card>

          <Card>
            <SectionTitle icon={Sparkles} title="Email" />
            {EMAIL_TONE_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                hint={opt.hint}
                selected={settings.emailTone === opt.value}
                onPress={() => setEmailTone(opt.value)}
              />
            ))}
          </Card>
        </>
      ) : null}
    </TabScreenScaffold>
  );
}

const styles = StyleSheet.create({
  promptBlock: { gap: Spacing.two },
  promptInput: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: "top",
  },
  charCount: { fontSize: 12, textAlign: "right" },
});
