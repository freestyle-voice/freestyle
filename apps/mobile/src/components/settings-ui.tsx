/**
 * Shared building blocks for the settings sub-pages (Profile, Tone,
 * Vocabulary, Dictionary, General). Keeps the visual language — cards with the
 * cloud's faint `ring-foreground/10` hairline, serif screen titles, icon+eyebrow
 * section headers, option cards with a left active marker — consistent across
 * every page.
 */

import { useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import type { ViewStyle } from "react-native";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HeaderActions } from "@/components/header-actions";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * Full-screen scaffold for pushed pages (Settings, Profile, Keyboard). The
 * page title lives in the top nav bar — Back on the left, title centered — so
 * it reads like a standard navigation header. Body scrolls below.
 */
export function SettingsScreenScaffold({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View style={styles.navBar}>
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
          <ThemedText type="title" style={styles.navTitle} numberOfLines={1}>
            {title}
          </ThemedText>
          {/* Balances the back button so the title stays centered. */}
          <View style={styles.navBack} />
        </View>
        <ScrollView
          contentContainerStyle={[styles.body, styles.tabBody]}
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

/**
 * Tab-root scaffold: the page title sits in the top nav bar (left) with the
 * Settings + Profile actions (right) — matching the pushed-page header so the
 * whole app reads consistently. An optional `action` renders just left of the
 * header actions (e.g. History's clear button).
 */
export function TabScreenScaffold({
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
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View style={styles.tabHeader}>
          <ThemedText
            type="title"
            style={styles.tabHeaderTitle}
            numberOfLines={1}
          >
            {title}
          </ThemedText>
          <View style={styles.tabHeaderActions}>
            {action}
            <HeaderActions />
          </View>
        </View>
        <ScrollView
          contentContainerStyle={[styles.body, styles.tabBody]}
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

/** A grouped panel with the cloud card treatment. */
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.cardRing },
        style,
      ]}
    >
      {children}
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

/**
 * A radio-style option card with a left-edge active marker — the same pattern
 * the desktop tone page uses. Shows a label + optional hint.
 */
export function OptionCard({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.option,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.accent : "transparent",
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
    fontSize: 26,
    lineHeight: 30,
  },
  backText: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  body: { paddingBottom: Spacing.six, gap: Spacing.four },
  // Tab roots sit under the floating pill tab bar, so clear extra space.
  tabBody: { paddingBottom: 120 },
  tabHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  tabHeaderTitle: {
    flex: 1,
    fontSize: 30,
    lineHeight: 34,
  },
  tabHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: Spacing.one,
    marginBottom: Spacing.two,
  },
  // Subtitle at the top of a pushed page (no big serif title above it).
  leadSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: -Spacing.one,
    marginBottom: Spacing.one,
  },

  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -Spacing.three,
  },

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
