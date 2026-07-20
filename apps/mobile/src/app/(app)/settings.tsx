import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
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

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signedIn, signOut } = useAuth();
  const { settings, setLanguage, setCleanup, setOverallTone } = useSettings();
  const [usage, setUsage] = useState<CloudUsageBalance | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ThemedText type="eyebrow" themeColor="primary">
              Back
            </ThemedText>
          </Pressable>
          <ThemedText type="eyebrow" themeColor="mutedForeground">
            Settings
          </ThemedText>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Section title="Account">
            <Row
              label="Signed in as"
              value={user?.email ?? user?.name ?? "—"}
            />
            <Row
              label="Credits"
              value={usage ? `${usage.remaining} / ${usage.limit}` : "—"}
              loading={usageLoading}
            />
          </Section>

          <Section title="Language">
            <View style={styles.chips}>
              {LANGUAGES.map((lang) => {
                const selected = settings.language === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    onPress={() => setLanguage(lang.code as LanguageCode)}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected ? theme.primary : theme.border,
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
                      {lang.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Cleanup">
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <ThemedText style={styles.rowLabel}>Polish my words</ThemedText>
                <ThemedText themeColor="mutedForeground" style={styles.rowHint}>
                  Removes filler and fixes punctuation with AI. Turn off for a
                  raw transcript.
                </ThemedText>
              </View>
              <Switch
                value={settings.cleanup}
                onValueChange={setCleanup}
                trackColor={{ true: theme.primary, false: theme.border }}
              />
            </View>

            {settings.cleanup ? (
              <View style={styles.toneBlock}>
                <ThemedText themeColor="mutedForeground" style={styles.rowHint}>
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
            ) : null}
          </Section>

          <Section title="Voice keyboard">
            <Pressable
              onPress={() => router.push("/(app)/keyboard-setup")}
              style={styles.linkRow}
            >
              <View style={styles.switchLabel}>
                <ThemedText style={styles.rowLabel}>
                  Set up the voice keyboard
                </ThemedText>
                <ThemedText themeColor="mutedForeground" style={styles.rowHint}>
                  Dictate into any app. Add the keyboard and enable Full Access.
                </ThemedText>
              </View>
              <ThemedText type="eyebrow" themeColor="primary">
                Open
              </ThemedText>
            </Pressable>
          </Section>

          <Pressable
            onPress={() => {
              void signOut().then(() => router.replace("/sign-in"));
            }}
            style={[styles.signOut, { borderColor: theme.border }]}
          >
            <ThemedText
              style={[styles.signOutText, { color: theme.destructive }]}
            >
              Sign out
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <ThemedText type="eyebrow" themeColor="mutedForeground">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  loading = false,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <View style={styles.row}>
      <ThemedText themeColor="mutedForeground" style={styles.rowLabel}>
        {label}
      </ThemedText>
      {loading ? (
        <Skeleton width={64} height={16} />
      ) : (
        <ThemedText style={styles.rowValue}>{value}</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.two,
  },
  content: { paddingVertical: Spacing.four, gap: Spacing.five },
  section: { gap: Spacing.three },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: { fontFamily: Fonts.sans, fontSize: 15 },
  rowValue: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  rowHint: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  chipText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
  linkRow: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
  switchLabel: { flex: 1 },
  toneBlock: { gap: Spacing.two },
  signOut: {
    marginTop: Spacing.two,
    height: 50,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutText: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
});
