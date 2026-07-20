import { useRouter } from "expo-router";
import { LogOut } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { Card, SettingsScreenScaffold } from "@/components/settings-ui";
import { Skeleton } from "@/components/skeleton";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { type CloudUsageBalance, fetchCloudUsage } from "@/lib/cloud/usage";
import { initialsFor } from "@/lib/initials";

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signedIn, signOut } = useAuth();
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
    <SettingsScreenScaffold title="Profile">
      {/* Account */}
      <Card>
        <View style={styles.accountHeader}>
          {user?.image ? (
            <Image
              source={{ uri: user.image }}
              style={styles.avatarImage}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
              <ThemedText
                style={[styles.avatarText, { color: theme.accentForeground }]}
              >
                {user ? initialsFor(user) : "?"}
              </ThemedText>
            </View>
          )}
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

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

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
      </Card>

      {/* Sign out */}
      <Pressable
        onPress={() => {
          void signOut().then(() => router.replace("/sign-in"));
        }}
        style={({ pressed }) => [
          styles.signOutCard,
          {
            backgroundColor: pressed
              ? theme.destructiveTintPressed
              : theme.destructiveTint,
          },
        ]}
      >
        <LogOut color={theme.destructive} size={18} />
        <ThemedText style={[styles.signOutText, { color: theme.destructive }]}>
          Sign out
        </ThemedText>
      </Pressable>
    </SettingsScreenScaffold>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -Spacing.three,
  },
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
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
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
  rowLabel: { fontFamily: Fonts.sans, fontSize: 15 },
  rowValue: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  signOutCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    height: 52,
    borderRadius: Radius.xl,
    marginTop: Spacing.two,
  },
  signOutText: { fontFamily: Fonts.sansMedium, fontSize: 15 },
});
