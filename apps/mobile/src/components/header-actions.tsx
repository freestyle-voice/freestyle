/**
 * Top-right header actions shared across all tab screens: a Settings gear and
 * the user's Profile avatar. Lets users reach Settings and Profile from any
 * tab (Home, History, Vocab, Tone, Dict) without a dedicated nav slot.
 */

import { useRouter } from "expo-router";
import { Settings } from "lucide-react-native";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { initialsFor } from "@/lib/initials";

export function HeaderActions() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        onPress={() => router.push("/(app)/settings")}
        hitSlop={10}
        style={[styles.iconButton, { borderColor: theme.border }]}
      >
        <Settings color={theme.mutedForeground} size={18} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profile"
        onPress={() => router.push("/(app)/profile")}
        hitSlop={10}
      >
        {user?.image ? (
          <Image
            source={{ uri: user.image }}
            style={styles.avatarImage}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View
            style={[
              styles.avatar,
              { backgroundColor: theme.accent, borderColor: theme.border },
            ]}
          >
            <ThemedText
              style={[styles.avatarText, { color: theme.accentForeground }]}
            >
              {user ? initialsFor(user) : "?"}
            </ThemedText>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: { width: 34, height: 34, borderRadius: Radius.full },
  avatarText: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
});
