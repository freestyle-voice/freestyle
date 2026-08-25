import { Check } from "lucide-react-native";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type SelectSheetOption = { value: string; label: string };

/** A compact single-choice picker for long profile and workspace option lists. */
export function SelectSheet({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClear,
  clearLabel = "Not set",
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SelectSheetOption[];
  selectedValue?: string;
  onSelect: (value: string) => void;
  onClear?: () => void;
  clearLabel?: string;
  onClose: () => void;
}) {
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
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={`Close ${title} picker`}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.card,
            borderColor: theme.cardRing,
            paddingBottom: Math.max(insets.bottom, Spacing.four) + Spacing.two,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <View style={styles.titleRow}>
          <ThemedText type="title" style={styles.title}>
            {title}
          </ThemedText>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Done selecting ${title}`}
          >
            <ThemedText style={[styles.done, { color: theme.primary }]}>
              Done
            </ThemedText>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {onClear ? (
            <SelectRow
              label={clearLabel}
              selected={!selectedValue}
              onPress={onClear}
            />
          ) : null}
          {options.map((option) => (
            <SelectRow
              key={option.value}
              label={option.label}
              selected={option.value === selectedValue}
              onPress={() => onSelect(option.value)}
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function SelectRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.border },
        pressed && { opacity: 0.65 },
      ]}
    >
      <ThemedText
        style={[
          styles.rowLabel,
          selected && { color: theme.primary, fontFamily: Fonts.sansSemiBold },
        ]}
      >
        {label}
      </ThemedText>
      {selected ? (
        <Check color={theme.primary} size={20} strokeWidth={2.5} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "72%",
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
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { marginBottom: Spacing.two },
  done: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  list: { paddingBottom: Spacing.two },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { flex: 1, fontFamily: Fonts.sans, fontSize: 16 },
});
