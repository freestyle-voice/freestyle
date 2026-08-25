import {
  Briefcase,
  Mail,
  MessageCircle,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { SelectSheet } from "@/components/select-sheet";
import {
  SettingsGroup,
  SettingsScreenScaffold,
  SettingsToggleRow,
  SettingsValueRow,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  EMAIL_TONE_OPTIONS,
  INTENSITY_OPTIONS,
  OVERALL_TONE_OPTIONS,
  PERSONAL_TONE_OPTIONS,
  type ToneOption,
  WORK_TONE_OPTIONS,
} from "@/lib/cleanup-tones";
import { useSettings } from "@/lib/settings";

const CUSTOM_PROMPT_MAX = 2000;

function labelFor<T extends string>(
  options: ToneOption<T>[],
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? "Off";
}

export default function ToneScreen() {
  const [intensitySheetOpen, setIntensitySheetOpen] = useState(false);
  const [overallSheetOpen, setOverallSheetOpen] = useState(false);
  const [personalSheetOpen, setPersonalSheetOpen] = useState(false);
  const [workSheetOpen, setWorkSheetOpen] = useState(false);
  const [emailSheetOpen, setEmailSheetOpen] = useState(false);
  const [customInstructionsOpen, setCustomInstructionsOpen] = useState(false);
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

  return (
    <SettingsScreenScaffold
      title="Cleanup & tone"
      subtitle="Choose how much dictation is polished, then tune the voice for each kind of writing."
    >
      <SettingsGroup title="Cleanup">
        <SettingsToggleRow
          icon={Sparkles}
          label="Clean up dictation"
          hint="Remove filler and fix punctuation before text is pasted."
          value={settings.cleanup}
          onValueChange={setCleanup}
          last
        />
      </SettingsGroup>

      {settings.cleanup ? (
        <>
          <SettingsGroup title="Writing style">
            <SettingsValueRow
              icon={SlidersHorizontal}
              label="Cleanup level"
              value={labelFor(INTENSITY_OPTIONS, settings.intensity)}
              onPress={() => setIntensitySheetOpen(true)}
            />
            <SettingsValueRow
              icon={Sparkles}
              label="Everyday writing"
              value={labelFor(OVERALL_TONE_OPTIONS, settings.overallTone)}
              onPress={() => setOverallSheetOpen(true)}
            />
            <SettingsValueRow
              icon={MessageCircle}
              label="Personal messages"
              value={labelFor(PERSONAL_TONE_OPTIONS, settings.personalTone)}
              onPress={() => setPersonalSheetOpen(true)}
            />
            <SettingsValueRow
              icon={Briefcase}
              label="Work chats"
              value={labelFor(WORK_TONE_OPTIONS, settings.workTone)}
              onPress={() => setWorkSheetOpen(true)}
            />
            <SettingsValueRow
              icon={Mail}
              label="Email"
              value={labelFor(EMAIL_TONE_OPTIONS, settings.emailTone)}
              onPress={() => setEmailSheetOpen(true)}
              last={settings.intensity !== "custom"}
            />
            {settings.intensity === "custom" ? (
              <SettingsValueRow
                icon={Sparkles}
                label="Custom instructions"
                value={
                  settings.customPrompt.trim() ? "Instructions set" : "Not set"
                }
                onPress={() => setCustomInstructionsOpen(true)}
                last
              />
            ) : null}
          </SettingsGroup>

          <ThemedText themeColor="mutedForeground" style={styles.footerHint}>
            These choices sync to Freestyle, so your voice stays consistent on
            your other devices.
          </ThemedText>
        </>
      ) : null}

      <SelectSheet
        visible={intensitySheetOpen}
        title="Cleanup level"
        options={INTENSITY_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        selectedValue={settings.intensity}
        onSelect={(value) => {
          setIntensity(value as typeof settings.intensity);
          setIntensitySheetOpen(false);
        }}
        onClose={() => setIntensitySheetOpen(false)}
      />
      <SelectSheet
        visible={overallSheetOpen}
        title="Everyday writing"
        options={OVERALL_TONE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        selectedValue={settings.overallTone}
        onSelect={(value) => {
          setOverallTone(value as typeof settings.overallTone);
          setOverallSheetOpen(false);
        }}
        onClose={() => setOverallSheetOpen(false)}
      />
      <SelectSheet
        visible={personalSheetOpen}
        title="Personal messages"
        options={PERSONAL_TONE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        selectedValue={settings.personalTone}
        onSelect={(value) => {
          setPersonalTone(value as typeof settings.personalTone);
          setPersonalSheetOpen(false);
        }}
        onClose={() => setPersonalSheetOpen(false)}
      />
      <SelectSheet
        visible={workSheetOpen}
        title="Work chats"
        options={WORK_TONE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        selectedValue={settings.workTone}
        onSelect={(value) => {
          setWorkTone(value as typeof settings.workTone);
          setWorkSheetOpen(false);
        }}
        onClose={() => setWorkSheetOpen(false)}
      />
      <SelectSheet
        visible={emailSheetOpen}
        title="Email"
        options={EMAIL_TONE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        selectedValue={settings.emailTone}
        onSelect={(value) => {
          setEmailTone(value as typeof settings.emailTone);
          setEmailSheetOpen(false);
        }}
        onClose={() => setEmailSheetOpen(false)}
      />
      <CustomInstructionsSheet
        visible={customInstructionsOpen}
        value={settings.customPrompt}
        onSave={setCustomPrompt}
        onClose={() => setCustomInstructionsOpen(false)}
      />
    </SettingsScreenScaffold>
  );
}

function CustomInstructionsSheet({
  visible,
  value,
  onSave,
  onClose,
}: {
  visible: boolean;
  value: string;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [value, visible]);

  const canSave = draft.trim() !== value.trim();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        enabled={Platform.OS !== "ios"}
        behavior="height"
        style={[styles.editorSheet, { backgroundColor: theme.background }]}
      >
        <View style={styles.editorNav}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cancel">
            <ThemedText style={[styles.editorAction, { color: theme.primary }]}>
              Cancel
            </ThemedText>
          </Pressable>
          <ThemedText style={styles.editorTitle}>
            Custom instructions
          </ThemedText>
          <Pressable
            onPress={() => {
              if (!canSave) return;
              onSave(draft.trim());
              onClose();
            }}
            disabled={!canSave}
            hitSlop={10}
            accessibilityLabel="Save custom instructions"
          >
            <ThemedText
              style={[
                styles.editorAction,
                { color: canSave ? theme.primary : theme.mutedForeground },
              ]}
            >
              Save
            </ThemedText>
          </Pressable>
        </View>
        <ThemedText themeColor="mutedForeground" style={styles.editorHint}>
          Tell Freestyle what to preserve or change whenever it cleans up your
          dictation.
        </ThemedText>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={CUSTOM_PROMPT_MAX}
          placeholder="Keep my slang, use short paragraphs, never add greetings…"
          placeholderTextColor={theme.mutedForeground}
          textAlignVertical="top"
          style={[
            styles.editorInput,
            {
              color: theme.foreground,
              backgroundColor: theme.secondary,
              borderColor: theme.border,
            },
          ]}
        />
        <ThemedText themeColor="mutedForeground" style={styles.characterCount}>
          {draft.length} / {CUSTOM_PROMPT_MAX}
        </ThemedText>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  footerHint: { fontSize: 13, lineHeight: 19, paddingHorizontal: Spacing.one },
  editorSheet: {
    flex: 1,
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  editorNav: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editorTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 17 },
  editorAction: { fontFamily: Fonts.sansMedium, fontSize: 16 },
  editorHint: { fontSize: 14, lineHeight: 20 },
  editorInput: {
    minHeight: 180,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 22,
  },
  characterCount: { fontSize: 12, textAlign: "right" },
});
