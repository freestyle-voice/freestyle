/**
 * Removable-pill multi-language selector (mobile settings + onboarding).
 *
 * Renders each selected language as a pill with a remove (×) affordance plus an
 * "Add language" pill that opens the searchable {@link LanguageSheet}. An empty
 * selection shows an "Auto-detect" hint pill. The number of languages is capped
 * at {@link MAX_LANGUAGES}; the sheet disables adding once the cap is reached.
 */

import type { SuggestedLanguage } from "@freestyle-voice/validations";
import {
  MAX_LANGUAGES,
  resolveLanguageOptions,
} from "@freestyle-voice/validations";
import { Plus, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { LanguageSheet } from "@/components/language-sheet";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { LANGUAGES } from "@/lib/settings";

const LOCAL_FALLBACK = LANGUAGES.map((l) => ({ code: l.code, label: l.name }));

interface LanguagePillsProps {
  /** Selected ISO codes (never includes "auto"). */
  values: string[];
  onChange: (codes: string[]) => void;
  suggestedLanguages?: SuggestedLanguage[];
}

export function LanguagePills({
  values,
  onChange,
  suggestedLanguages,
}: LanguagePillsProps) {
  const theme = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Resolve labels from the full option set (cloud when present, else bundled).
  const options = useMemo(
    () => resolveLanguageOptions(suggestedLanguages, LOCAL_FALLBACK),
    [suggestedLanguages],
  );
  const labelFor = (code: string): string =>
    options.find((o) => o.code === code)?.label ?? code;

  const atCap = values.length >= MAX_LANGUAGES;

  const toggle = (code: string): void => {
    if (values.includes(code)) {
      onChange(values.filter((c) => c !== code));
    } else if (!atCap) {
      onChange([...values, code]);
    }
  };

  return (
    <View style={styles.wrap}>
      {values.length === 0 ? (
        <View
          style={[
            styles.autoPill,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <ThemedText
            style={[styles.autoText, { color: theme.mutedForeground }]}
          >
            Auto-detect
          </ThemedText>
        </View>
      ) : (
        values.map((code) => (
          <View
            key={code}
            style={[styles.pill, { backgroundColor: theme.secondary }]}
          >
            <ThemedText style={[styles.pillText, { color: theme.foreground }]}>
              {labelFor(code)}
            </ThemedText>
            <Pressable
              onPress={() => onChange(values.filter((c) => c !== code))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${labelFor(code)}`}
              style={styles.remove}
            >
              <X color={theme.foreground} size={14} strokeWidth={2.5} />
            </Pressable>
          </View>
        ))
      )}

      <Pressable
        onPress={() => setSheetOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Add language"
        style={({ pressed }) => [
          styles.addPill,
          { borderColor: theme.border },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Plus color={theme.foreground} size={15} strokeWidth={2.5} />
        <ThemedText style={[styles.addText, { color: theme.foreground }]}>
          Add language
        </ThemedText>
      </Pressable>

      <LanguageSheet
        visible={sheetOpen}
        selected={values}
        onToggle={toggle}
        onClose={() => setSheetOpen(false)}
        suggestedLanguages={suggestedLanguages}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.two,
  },
  autoPill: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingVertical: Spacing.two - 2,
    paddingHorizontal: Spacing.three,
  },
  autoText: { fontFamily: Fonts.sans, fontSize: 14 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    borderRadius: Radius.full,
    paddingVertical: Spacing.two - 2,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
  },
  pillText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  remove: {
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
  },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingVertical: Spacing.two - 2,
    paddingHorizontal: Spacing.three,
  },
  addText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
});
