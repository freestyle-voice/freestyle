/**
 * Bottom-sheet multi-language picker. Slides up from the bottom on both
 * platforms — a tap-to-dismiss backdrop, a drag handle, a search field, and a
 * scrollable list of languages with a checkmark on each selected one. Tapping a
 * row toggles it (the sheet stays open so several can be chosen). The number of
 * languages is capped at {@link MAX_LANGUAGES}; once reached, unselected rows are
 * disabled. Extra bottom padding keeps the last options clear of the home
 * indicator.
 *
 * Options come from the cloud `suggestedLanguages` (the full Soniox set,
 * region-ordered) and fall back to the small bundled {@link LANGUAGES} list when
 * offline / signed out.
 */

import type { SuggestedLanguage } from "@freestyle-voice/validations";
import {
  filterLanguageOptions,
  MAX_LANGUAGES,
  resolveLanguageOptions,
} from "@freestyle-voice/validations";
import { Check, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { LANGUAGES } from "@/lib/settings";

interface LanguageSheetProps {
  visible: boolean;
  /** Currently selected ISO codes (never includes "auto"). */
  selected: string[];
  /** Toggle a language on/off. The sheet stays open. */
  onToggle: (code: string) => void;
  onClose: () => void;
  /**
   * Cloud-suggested languages for the user's region (from `/v2/config`). When
   * present, this is the full option set (region-ordered); otherwise the small
   * bundled list is used.
   */
  suggestedLanguages?: SuggestedLanguage[];
}

/** Bundled fallback options in the shared `{ code, label }` shape. */
const LOCAL_FALLBACK = LANGUAGES.map((l) => ({ code: l.code, label: l.name }));

export function LanguageSheet({
  visible,
  selected,
  onToggle,
  onClose,
  suggestedLanguages,
}: LanguageSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  // Full option set from the cloud (region-ordered). "auto" is a picker-only
  // sentinel that has no place in a multi-select list, so it's excluded.
  const languages = useMemo(
    () =>
      resolveLanguageOptions(suggestedLanguages, LOCAL_FALLBACK).filter(
        (l) => l.code !== "auto",
      ),
    [suggestedLanguages],
  );

  const filtered = useMemo(
    () => filterLanguageOptions(languages, query),
    [languages, query],
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const atCap = selected.length >= MAX_LANGUAGES;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Tap-outside-to-dismiss backdrop. */}
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close language picker"
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.card,
            borderColor: theme.cardRing,
            // Clear the home indicator, with a floor so it never hugs the edge.
            paddingBottom: Math.max(insets.bottom, Spacing.four) + Spacing.two,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <View style={styles.titleRow}>
          <ThemedText type="title" style={styles.title}>
            Languages
          </ThemedText>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Done selecting languages"
            hitSlop={8}
          >
            <ThemedText style={[styles.done, { color: theme.primary }]}>
              Done
            </ThemedText>
          </Pressable>
        </View>
        <View
          style={[
            styles.searchRow,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <Search color={theme.mutedForeground} size={18} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search languages…"
            placeholderTextColor={theme.mutedForeground}
            autoCorrect={false}
            autoCapitalize="none"
            style={[styles.searchInput, { color: theme.foreground }]}
          />
        </View>
        {atCap ? (
          <ThemedText style={[styles.hint, { color: theme.mutedForeground }]}>
            {`Up to ${MAX_LANGUAGES} languages.`}
          </ThemedText>
        ) : null}
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <ThemedText
              style={[styles.empty, { color: theme.mutedForeground }]}
            >
              No languages found
            </ThemedText>
          ) : (
            filtered.map((lang) => {
              const active = selectedSet.has(lang.code);
              const disabled = !active && atCap;
              return (
                <Pressable
                  key={lang.code}
                  disabled={disabled}
                  onPress={() => onToggle(lang.code)}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: theme.border },
                    disabled && { opacity: 0.4 },
                    pressed && !disabled && { opacity: 0.6 },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.rowLabel,
                      active && {
                        color: theme.primary,
                        fontFamily: Fonts.sansSemiBold,
                      },
                    ]}
                  >
                    {lang.label}
                  </ThemedText>
                  {active ? (
                    <Check color={theme.primary} size={20} strokeWidth={2.5} />
                  ) : null}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "75%",
    borderTopLeftRadius: Radius["2xl"],
    borderTopRightRadius: Radius["2xl"],
    borderWidth: 1,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    marginBottom: Spacing.three,
  },
  title: { marginBottom: Spacing.two },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  done: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  hint: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    marginBottom: Spacing.two,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    height: 40,
    marginBottom: Spacing.two,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 16,
    padding: 0,
  },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: Spacing.two },
  empty: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    textAlign: "center",
    paddingVertical: Spacing.six,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.three - 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontFamily: Fonts.sans, fontSize: 16 },
});
