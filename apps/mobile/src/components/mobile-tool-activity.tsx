import type { UIMessage } from "ai";
import { Check, CircleAlert } from "lucide-react-native";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  type MobileToolActivityItem,
  mobileToolActivity,
} from "@/lib/remix/tool-activity";

function ToolStateIcon({ phase }: { phase: MobileToolActivityItem["phase"] }) {
  const theme = useTheme();
  if (phase === "running") {
    return <ActivityIndicator color={theme.primary} size="small" />;
  }
  if (phase === "failed" || phase === "declined") {
    return <CircleAlert color={theme.destructive} size={15} />;
  }
  return <Check color={theme.primary} size={16} />;
}

/**
 * A deliberately quiet execution trail. Keep the visible transcript focused
 * on the external services Remix used, never the private results they returned.
 */
export function MobileToolActivity({ parts }: { parts: UIMessage["parts"] }) {
  const items = mobileToolActivity(parts);
  if (items.length === 0) return null;

  return (
    <View
      accessibilityLabel={`Activity: ${items.map((item) => item.title).join(", ")}`}
      style={styles.root}
    >
      {items.map((item, index) => (
        <View key={`${item.title}-${index}`} style={styles.row}>
          <View style={styles.state}>
            <ToolStateIcon phase={item.phase} />
          </View>
          <View style={styles.copy}>
            <ThemedText numberOfLines={1} style={styles.title}>
              {item.title}
              {item.detail ? (
                <ThemedText style={styles.detail} themeColor="mutedForeground">
                  {` · ${item.detail}`}
                </ThemedText>
              ) : null}
            </ThemedText>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: "stretch", gap: Spacing.one, marginVertical: Spacing.one },
  row: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 20 },
  state: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0 },
  title: { fontFamily: Fonts.sansMedium, fontSize: 13, lineHeight: 18 },
  detail: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
});
