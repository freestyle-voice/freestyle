/**
 * Bottom-sheet language picker. Replaces the platform-split wheel/list picker
 * with a single sheet that slides up from the bottom on both platforms —
 * a tap-to-dismiss backdrop, a drag handle, and a scrollable list of languages
 * with a checkmark on the active one. Extra bottom padding keeps the last
 * options clear of the home indicator.
 */

import { Check } from "lucide-react-native";
import { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { LANGUAGES, type LanguageCode } from "@/lib/settings";

interface LanguageSheetProps {
  visible: boolean;
  selected: LanguageCode;
  onSelect: (code: LanguageCode) => void;
  onClose: () => void;
  /**
   * Cloud-suggested language codes for the user's region (from `/v2/config`).
   * When present, matching languages are surfaced first (after "auto"),
   * preserving the original order otherwise.
   */
  suggestedCodes?: string[];
}

export function LanguageSheet({
  visible,
  selected,
  onSelect,
  onClose,
  suggestedCodes,
}: LanguageSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const languages = useMemo(() => {
    if (!suggestedCodes?.length) return LANGUAGES;
    const rank = new Map(suggestedCodes.map((code, i) => [code, i]));
    // "auto" is pinned first; everything else sorts by suggested rank, then by
    // the original list order (stable) for non-suggested languages.
    return [...LANGUAGES]
      .map((lang, i) => ({ lang, i }))
      .sort((a, b) => {
        if (a.lang.code === "auto") return -1;
        if (b.lang.code === "auto") return 1;
        const ra = rank.get(a.lang.code);
        const rb = rank.get(b.lang.code);
        if (ra !== undefined && rb !== undefined) return ra - rb;
        if (ra !== undefined) return -1;
        if (rb !== undefined) return 1;
        return a.i - b.i;
      })
      .map((x) => x.lang);
  }, [suggestedCodes]);

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
        <ThemedText type="title" style={styles.title}>
          Language
        </ThemedText>
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {languages.map((lang) => {
            const active = lang.code === selected;
            return (
              <Pressable
                key={lang.code}
                onPress={() => {
                  onSelect(lang.code);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: theme.border },
                  pressed && { opacity: 0.6 },
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
                  {lang.name}
                </ThemedText>
                {active ? (
                  <Check color={theme.primary} size={20} strokeWidth={2.5} />
                ) : null}
              </Pressable>
            );
          })}
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
  list: { flexGrow: 0 },
  listContent: { paddingBottom: Spacing.two },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.three - 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontFamily: Fonts.sans, fontSize: 16 },
});
