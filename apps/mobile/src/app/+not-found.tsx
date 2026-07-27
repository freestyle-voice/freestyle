/**
 * Fallback screen for any URL that doesn't match a route.
 *
 * In normal use this should never appear: the keyboard's `freestyle://dictate`
 * link is rewritten to the home tab in `+native-intent.tsx` before routing, and
 * every real route has a screen. It exists as a safety net + debugging aid — if
 * a deep link (from the keyboard, a stale build, or a mistyped scheme) ever
 * fails to resolve, we show *what* it tried to open instead of Expo Router's
 * bare built-in "Unmatched Route" screen, and report it to Sentry with the same
 * context so we can debug it from a real device without a cable.
 */

import * as Sentry from "@sentry/react-native";
import * as Clipboard from "expo-clipboard";
import {
  Link,
  useGlobalSearchParams,
  usePathname,
  useSegments,
} from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export default function NotFound() {
  const theme = useTheme();
  // What the router actually tried to open — the single most useful thing to
  // see when a deep link misbehaves.
  const pathname = usePathname();
  const segments = useSegments();
  const params = useGlobalSearchParams();
  const [copied, setCopied] = useState(false);

  // A stringified snapshot so the on-screen "Copy details" button and the
  // Sentry breadcrumb carry identical, greppable context.
  const details = [
    `pathname: ${pathname}`,
    `segments: ${JSON.stringify(segments)}`,
    `params: ${JSON.stringify(params)}`,
  ].join("\n");

  useEffect(() => {
    // Report once per distinct path so a real-device miss is debuggable
    // remotely. Non-fatal — this screen is itself the user-facing handling.
    Sentry.captureMessage(`Unmatched route: ${pathname}`, {
      level: "warning",
      extra: { pathname, segments, params },
    });
  }, [pathname, segments, params]);

  const copy = async () => {
    await Clipboard.setStringAsync(details);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.body}>
          <ThemedText type="eyebrow" themeColor="mutedForeground">
            Route not found
          </ThemedText>
          <ThemedText type="title" style={styles.heading}>
            We couldn&apos;t open that link.
          </ThemedText>

          <View style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText themeColor="mutedForeground" style={styles.detailLabel}>
              TRIED TO OPEN
            </ThemedText>
            <ThemedText style={styles.detailValue}>
              {pathname || "(empty path)"}
            </ThemedText>
            <ThemedText themeColor="mutedForeground" style={styles.detailMeta}>
              segments {JSON.stringify(segments)}
            </ThemedText>
            {Object.keys(params).length > 0 ? (
              <ThemedText
                themeColor="mutedForeground"
                style={styles.detailMeta}
              >
                params {JSON.stringify(params)}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.actions}>
            <Link href="/(app)/(tabs)" replace asChild>
              <Pressable
                style={[styles.action, { backgroundColor: theme.primary }]}
              >
                <ThemedText
                  style={[
                    styles.actionText,
                    { color: theme.primaryForeground },
                  ]}
                >
                  Go home
                </ThemedText>
              </Pressable>
            </Link>
            <Pressable
              onPress={copy}
              style={[styles.actionOutline, { borderColor: theme.border }]}
            >
              <ThemedText style={styles.actionText}>
                {copied ? "Copied" : "Copy details"}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: Spacing.four },
  body: { flex: 1, justifyContent: "center", gap: Spacing.three },
  heading: { marginTop: Spacing.one },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  detailLabel: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  detailValue: {
    fontFamily: Fonts.mono,
    fontSize: 14,
  },
  detailMeta: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 16,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  action: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.full,
  },
  actionOutline: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  actionText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
});
