/**
 * Shared building blocks for settings and account sub-pages. Their hierarchy is
 * intentionally close to native mobile settings: a compact navigation bar,
 * descriptive section labels, and soft grouped surfaces instead of a feed of
 * bordered product cards.
 */

import { useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react-native";
import type { ComponentType, ReactNode } from "react";
import type {
  AccessibilityRole,
  DimensionValue,
  ViewStyle,
} from "react-native";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Fonts, Layout, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * Full-screen scaffold for pushed pages (Settings, Profile, Keyboard). The
 * page title lives in the top nav bar — Back on the left, title centered — so
 * it reads like a standard navigation header. Body scrolls below.
 */
export function SettingsScreenScaffold({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View style={[styles.navBar, styles.centerColumn]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.navBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ChevronLeft color={theme.primary} size={22} />
            <ThemedText style={[styles.backText, { color: theme.primary }]}>
              Back
            </ThemedText>
          </Pressable>
          <ThemedText
            style={[styles.navTitle, { color: theme.foreground }]}
            numberOfLines={1}
          >
            {title}
          </ThemedText>
          {/* Balances the back button so the title stays centered. */}
          {action ? (
            <View style={styles.navAction}>{action}</View>
          ) : (
            <View style={styles.navBack} />
          )}
        </View>
        <ScrollView
          contentContainerStyle={[styles.body, styles.centerColumn]}
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {subtitle ? (
            <ThemedText
              themeColor="mutedForeground"
              style={styles.leadSubtitle}
            >
              {subtitle}
            </ThemedText>
          ) : null}
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** A soft filled surface for form controls and detailed settings. */
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.secondary }, style]}>
      {children}
    </View>
  );
}

/** A native-style labelled group used for collections of navigation rows. */
export function SettingsGroup({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      {title ? (
        <ThemedText themeColor="mutedForeground" style={styles.groupTitle}>
          {title}
        </ThemedText>
      ) : null}
      <View
        style={[
          styles.groupSurface,
          { backgroundColor: theme.secondary },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/** A consistent, actionable recovery state for cloud-backed screens. */
export function RetryLoadState({
  message = "We couldn't load this right now.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.retryLoad}>
      <ThemedText themeColor="mutedForeground" style={styles.retryMessage}>
        {message}
      </ThemedText>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Try loading again"
        style={({ pressed }) => [
          styles.retryButton,
          { borderColor: theme.border },
          pressed && { opacity: 0.6 },
        ]}
      >
        <RotateCw color={theme.primary} size={15} />
        <ThemedText style={[styles.retryText, { color: theme.primary }]}>
          Try again
        </ThemedText>
      </Pressable>
    </View>
  );
}

/** Icon + uppercase eyebrow section header used inside cards. */
export function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <Icon color={theme.mutedForeground} size={16} />
      <ThemedText type="eyebrow" themeColor="mutedForeground">
        {title}
      </ThemedText>
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

/** Shared icon + label navigation/link row used across pushed settings pages. */
export function SettingsNavRow({
  icon: Icon,
  label,
  value,
  onPress,
  last = false,
  accessibilityRole = "button",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onPress: () => void;
  last?: boolean;
  accessibilityRole?: AccessibilityRole;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.navRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Icon color={theme.mutedForeground} size={20} />
      <View style={styles.navRowContent}>
        <ThemedText style={styles.navRowLabel} numberOfLines={1}>
          {label}
        </ThemedText>
        <ThemedText
          themeColor="mutedForeground"
          style={styles.navRowValue}
          numberOfLines={1}
        >
          {value}
        </ThemedText>
      </View>
      <ChevronRight color={theme.mutedForeground} size={18} />
    </Pressable>
  );
}

/**
 * An iOS-style account row: the setting name stays on the left and its current
 * value is immediately scannable on the right. Use this for editable profile
 * and account fields, not for descriptive navigation.
 */
export function SettingsValueRow({
  icon: Icon,
  label,
  value,
  onPress,
  last = false,
  disabled = false,
  trailing,
  valueMaxWidth,
}: {
  icon?: LucideIcon | ComponentType<{ color?: string; size?: number }>;
  label: string;
  value: string;
  onPress?: () => void;
  last?: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
  /** Lets data-heavy account rows reserve more room without changing all rows. */
  valueMaxWidth?: DimensionValue;
}) {
  const theme = useTheme();
  const content = (
    <>
      {Icon ? <Icon color={theme.mutedForeground} size={20} /> : null}
      <ThemedText
        style={styles.valueRowLabel}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </ThemedText>
      <ThemedText
        themeColor="mutedForeground"
        style={[
          styles.valueRowValue,
          valueMaxWidth ? { maxWidth: valueMaxWidth } : null,
        ]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {value}
      </ThemedText>
      {trailing ??
        (onPress ? (
          <ChevronRight color={theme.mutedForeground} size={18} />
        ) : null)}
    </>
  );
  const rowStyle = [
    styles.valueRow,
    !last && {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    disabled && styles.valueRowDisabled,
  ];

  if (!onPress) return <View style={rowStyle}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        rowStyle,
        pressed && !disabled && { opacity: 0.6 },
      ]}
    >
      {content}
    </Pressable>
  );
}

/** A native switch row for binary preferences that take effect immediately. */
export function SettingsToggleRow({
  icon: Icon,
  label,
  hint,
  value,
  onValueChange,
  last = false,
  disabled = false,
}: {
  icon?: LucideIcon | ComponentType<{ color?: string; size?: number }>;
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  last?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.toggleRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
        disabled && styles.valueRowDisabled,
      ]}
    >
      {Icon ? <Icon color={theme.mutedForeground} size={20} /> : null}
      <View style={styles.toggleCopy}>
        <ThemedText style={styles.valueRowLabel} numberOfLines={1}>
          {label}
        </ThemedText>
        {hint ? (
          <ThemedText
            themeColor="mutedForeground"
            style={styles.toggleHint}
            numberOfLines={1}
          >
            {hint}
          </ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityHint={hint}
        trackColor={{ false: theme.border, true: theme.primary }}
        thumbColor={theme.primaryForeground}
      />
    </View>
  );
}

/**
 * A radio-style option card with a left-edge active marker — the same pattern
 * the desktop tone page uses. Shows a label + optional hint.
 */
export function OptionCard({
  label,
  hint,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={[
        styles.option,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.accent : "transparent",
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      {selected ? (
        <View
          style={[styles.optionMarker, { backgroundColor: theme.primary }]}
        />
      ) : null}
      <View style={styles.optionText}>
        <ThemedText
          style={[
            styles.optionLabel,
            {
              color: selected ? theme.accentForeground : theme.foreground,
            },
          ]}
        >
          {label}
        </ThemedText>
        {hint ? (
          <ThemedText
            style={[
              styles.optionHint,
              {
                color: selected
                  ? theme.accentForeground
                  : theme.mutedForeground,
              },
            ]}
          >
            {hint}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  centerColumn: {
    width: "100%",
    maxWidth: Layout.contentMaxWidth,
    alignSelf: "center" as const,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  navBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    marginLeft: -6,
    minWidth: 76,
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: Fonts.sansSemiBold,
    fontSize: 20,
  },
  navAction: {
    minWidth: 76,
    alignItems: "flex-end",
  },
  backText: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  // Leave room for the floating keyboard dictation status strip at the end of
  // a long settings page.
  body: { paddingBottom: 100, gap: Spacing.four },
  // Subtitle at the top of a pushed page (no big serif title above it).
  leadSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: -Spacing.one,
    marginBottom: Spacing.one,
  },

  card: {
    borderRadius: 22,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  group: { gap: Spacing.two },
  groupTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 17,
    paddingHorizontal: Spacing.one,
  },
  groupSurface: {
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    overflow: "hidden",
  },
  retryLoad: {
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  retryMessage: { textAlign: "center", fontSize: 14, lineHeight: 21 },
  retryButton: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.full,
  },
  retryText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -Spacing.three,
  },
  navRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  navRowContent: { flex: 1, minWidth: 0 },
  navRowLabel: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  navRowValue: { fontSize: 13, marginTop: 1 },

  valueRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  valueRowDisabled: { opacity: 0.55 },
  valueRowLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.sansMedium,
    fontSize: 16,
  },
  valueRowValue: {
    maxWidth: "38%",
    flexShrink: 1,
    minWidth: 0,
    fontFamily: Fonts.sans,
    fontSize: 15,
    textAlign: "right",
  },
  toggleRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  toggleCopy: { flex: 1, minWidth: 0, gap: 1 },
  toggleHint: { fontSize: 13, lineHeight: 18 },

  option: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.two + 2,
    paddingRight: Spacing.three,
    paddingLeft: Spacing.three,
    overflow: "hidden",
  },
  optionMarker: {
    position: "absolute",
    left: 0,
    top: "50%",
    width: 4,
    height: 22,
    marginTop: -11,
    borderTopRightRadius: Radius.full,
    borderBottomRightRadius: Radius.full,
  },
  optionText: { flex: 1 },
  optionLabel: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  optionHint: { fontFamily: Fonts.sans, fontSize: 13, marginTop: 2 },
});
