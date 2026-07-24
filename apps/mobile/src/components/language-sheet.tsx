/**
 * Bottom-sheet language picker. Replaces the platform-split wheel/list picker
 * with a single sheet that slides up from the bottom on both platforms —
 * a tap-to-dismiss backdrop, a drag handle, and a scrollable list of languages
 * with a checkmark on the active one. Extra bottom padding keeps the last
 * options clear of the home indicator.
 */

import { Check } from "lucide-react-native";
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
}

export function LanguageSheet({
  visible,
  selected,
  onSelect,
  onClose,
}: LanguageSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

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
          {LANGUAGES.map((lang) => {
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
