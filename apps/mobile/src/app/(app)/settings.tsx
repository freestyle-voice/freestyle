import { useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Keyboard,
  LogOut,
  Sparkles,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Skeleton } from "@/components/skeleton";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { OVERALL_TONE_OPTIONS } from "@/lib/cleanup-tones";
import { type CloudUsageBalance, fetchCloudUsage } from "@/lib/cloud/usage";
import { LANGUAGES, type LanguageCode, useSettings } from "@/lib/settings";

function initialsFor(user: { name?: string | null; email?: string | null }) {
  const source = user.name?.trim() || user.email?.trim() || "";
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signedIn, signOut } = useAuth();
  const { settings, setLanguage, setCleanup, setOverallTone } = useSettings();
  const [usage, setUsage] = useState<CloudUsageBalance | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    setUsageLoading(true);
    fetchCloudUsage()
      .then((data) => {
        if (active) setUsage(data);
      })
      .catch(() => {
        if (active) setUsage(null);
      })
      .finally(() => {
        if (active) setUsageLoading(false);
      });
    return () => {
      active = false;
    };
  }, [signedIn]);

  const selectedLanguage = useMemo(
    () =>
      LANGUAGES.find((lang) => lang.code === settings.language) ?? LANGUAGES[0],
    [settings.language],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backButton}
          >
            <ChevronLeft color={theme.primary} size={20} />
            <ThemedText style={[styles.backText, { color: theme.primary }]}>
              Back
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <ThemedText type="title" style={styles.screenTitle}>
            Settings
          </ThemedText>

          {/* Account */}
          <Card>
            <View style={styles.accountHeader}>
              <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
                <ThemedText
                  style={[styles.avatarText, { color: theme.accentForeground }]}
                >
                  {user ? initialsFor(user) : "?"}
                </ThemedText>
              </View>
              <View style={styles.accountInfo}>
                <ThemedText style={styles.accountName} numberOfLines={1}>
                  {user?.name ?? "Signed in"}
                </ThemedText>
                {user?.email ? (
                  <ThemedText
                    themeColor="mutedForeground"
                    style={styles.accountEmail}
                    numberOfLines={1}
                  >
                    {user.email}
                  </ThemedText>
                ) : null}
              </View>
            </View>

            <Divider />

            <View style={styles.inlineRow}>
              <ThemedText themeColor="mutedForeground" style={styles.rowLabel}>
                Credits
              </ThemedText>
              {usageLoading ? (
                <Skeleton width={72} height={16} />
              ) : (
                <ThemedText style={styles.rowValue}>
                  {usage ? `${usage.remaining} / ${usage.limit}` : "—"}
                </ThemedText>
              )}
            </View>

            <Divider />

            <Pressable
              onPress={() => {
                void signOut().then(() => router.replace("/sign-in"));
              }}
              style={({ pressed }) => [
                styles.signOutRow,
                {
                  backgroundColor: pressed
                    ? theme.destructiveTintPressed
                    : theme.destructiveTint,
                },
              ]}
            >
              <LogOut color={theme.destructive} size={17} />
              <ThemedText
                style={[styles.signOutText, { color: theme.destructive }]}
              >
                Sign out
              </ThemedText>
            </Pressable>
          </Card>

          {/* Language */}
          <Card>
            <SectionTitle icon={Globe} title="Language" />
            <Pressable
              onPress={() => setLanguageSheetOpen(true)}
              style={styles.navRow}
            >
              <View style={styles.navRowContent}>
                <ThemedText style={styles.rowValue}>
                  {selectedLanguage.name}
                </ThemedText>
                <ThemedText themeColor="mutedForeground" style={styles.rowHint}>
                  The language you'll dictate in.
                </ThemedText>
              </View>
              <ChevronRight color={theme.mutedForeground} size={18} />
            </Pressable>
          </Card>

          {/* Cleanup */}
          <Card>
            <SectionTitle icon={Sparkles} title="Cleanup" />
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <ThemedText style={styles.rowValue}>Polish my words</ThemedText>
                <ThemedText themeColor="mutedForeground" style={styles.rowHint}>
                  Removes filler and fixes punctuation with AI. Turn off for a
                  raw transcript.
                </ThemedText>
              </View>
              <Switch
                value={settings.cleanup}
                onValueChange={setCleanup}
                trackColor={{ true: theme.primary, false: theme.switchTrack }}
              />
            </View>

            {settings.cleanup ? (
              <>
                <Divider />
                <View style={styles.toneBlock}>
                  <ThemedText type="eyebrow" themeColor="mutedForeground">
                    Tone
                  </ThemedText>
                  <View style={styles.chips}>
                    {OVERALL_TONE_OPTIONS.map((tone) => {
                      const selected = settings.overallTone === tone.value;
                      return (
                        <Pressable
                          key={tone.value}
                          onPress={() => setOverallTone(tone.value)}
                          style={[
                            styles.chip,
                            {
                              borderColor: selected
                                ? theme.primary
                                : theme.border,
                              backgroundColor: selected
                                ? theme.accent
                                : "transparent",
                            },
                          ]}
                        >
                          <ThemedText
                            style={[
                              styles.chipText,
                              {
                                color: selected
                                  ? theme.accentForeground
                                  : theme.foreground,
                              },
                            ]}
                          >
                            {tone.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </>
            ) : null}
          </Card>

          {/* Voice keyboard */}
          <Card>
            <SectionTitle icon={Keyboard} title="Voice Keyboard" />
            <Pressable
              onPress={() => router.push("/(app)/keyboard-setup")}
              style={styles.navRow}
            >
              <View style={styles.navRowContent}>
                <ThemedText style={styles.rowValue}>
                  Set up the voice keyboard
                </ThemedText>
                <ThemedText themeColor="mutedForeground" style={styles.rowHint}>
                  Dictate into any app. Add the keyboard and enable Full Access.
                </ThemedText>
              </View>
              <ChevronRight color={theme.mutedForeground} size={18} />
            </Pressable>
          </Card>
        </ScrollView>
      </SafeAreaView>

      <LanguageSheet
        open={languageSheetOpen}
        selected={settings.language}
        onSelect={(code) => {
          setLanguage(code);
          setLanguageSheetOpen(false);
        }}
        onClose={() => setLanguageSheetOpen(false)}
      />
    </ThemedView>
  );
}

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          // Cloud uses `ring-1 ring-foreground/10` — a faint hairline in the
          // ink color at 10% opacity, not the tan border. Elevation reads from
          // the lighter card bg plus this barely-there edge.
          borderColor: theme.cardRing,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

function SectionTitle({
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

function LanguageSheet({
  open,
  selected,
  onSelect,
  onClose,
}: {
  open: boolean;
  selected: LanguageCode;
  onSelect: (code: LanguageCode) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.sheetRoot}>
        <Pressable style={styles.sheetOverlay} onPress={onClose} />
        <View style={[styles.sheetContainer, { backgroundColor: theme.card }]}>
          <SafeAreaView edges={["bottom"]}>
            <View
              style={[styles.sheetHandle, { backgroundColor: theme.border }]}
            />
            <ThemedText type="title" style={styles.sheetTitle}>
              Language
            </ThemedText>
            <ScrollView
              style={styles.sheetScroll}
              showsVerticalScrollIndicator={false}
            >
              {LANGUAGES.map((lang) => {
                const isSelected = selected === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    onPress={() => onSelect(lang.code as LanguageCode)}
                    style={[
                      styles.sheetRow,
                      { borderBottomColor: theme.border },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.sheetRowText,
                        isSelected ? { color: theme.primary } : null,
                      ]}
                    >
                      {lang.name}
                    </ThemedText>
                    {isSelected ? (
                      <Check color={theme.primary} size={18} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Spacing.two,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: -4,
  },
  backText: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  content: { paddingBottom: Spacing.six, gap: Spacing.four },
  screenTitle: { marginTop: Spacing.three, marginBottom: Spacing.two },

  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -Spacing.three,
  },

  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },

  // Account
  accountHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: Fonts.sansSemiBold, fontSize: 17 },
  accountInfo: { flex: 1 },
  accountName: { fontFamily: Fonts.serif, fontSize: 22, lineHeight: 24 },
  accountEmail: { fontSize: 13, marginTop: 3 },

  inlineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    height: 40,
    borderRadius: Radius.lg,
  },
  signOutText: { fontFamily: Fonts.sansMedium, fontSize: 14 },

  // Generic rows
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  navRowContent: { flex: 1 },
  rowLabel: { fontFamily: Fonts.sans, fontSize: 15 },
  rowValue: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  rowHint: { fontSize: 13, lineHeight: 19, marginTop: 2 },

  // Cleanup
  switchRow: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
  switchLabel: { flex: 1 },
  toneBlock: { gap: Spacing.two },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  chipText: { fontFamily: Fonts.sansMedium, fontSize: 13 },

  // Language sheet
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheetOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetContainer: {
    borderTopLeftRadius: Radius["2xl"],
    borderTopRightRadius: Radius["2xl"],
    maxHeight: "72%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: Spacing.two,
    marginBottom: Spacing.three,
  },
  sheetTitle: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
  },
  sheetScroll: { paddingHorizontal: Spacing.four },
  sheetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetRowText: { fontFamily: Fonts.sansMedium, fontSize: 16 },
});
