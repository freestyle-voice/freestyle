import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Check, Plus } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { listConnectorConnections } from "@/lib/cloud/connectors";
import {
  connectedSuggestionSlugs,
  parseConnectSuggestions,
} from "@/lib/remix/connect-suggestions";

/**
 * Connector suggestions are semantic tool output, not ordinary assistant copy.
 * Give them the same explicit, actionable presentation as the desktop cards,
 * while routing the user to the existing mobile connection flow for the actual
 * authorization step.
 */
export function MobileConnectSuggestions({ output }: { output: unknown }) {
  const router = useRouter();
  const theme = useTheme();
  const suggestions = parseConnectSuggestions(output);
  const { data: connections = [] } = useQuery({
    queryKey: ["connector-connections"],
    queryFn: listConnectorConnections,
    staleTime: 30_000,
  });
  const connectedSlugs = connectedSuggestionSlugs(connections);
  if (suggestions.length === 0) return null;

  return (
    <View style={styles.root}>
      <ThemedText type="eyebrow" themeColor="mutedForeground">
        SUGGESTED APPS
      </ThemedText>
      <View style={[styles.list, { backgroundColor: theme.secondary }]}>
        {suggestions.map((suggestion, index) => {
          const connected = connectedSlugs.has(suggestion.slug);
          const rowStyle = [
            styles.suggestionRow,
            index < suggestions.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.border,
            },
          ];
          const content = (
            <>
              <View style={[styles.icon, { backgroundColor: theme.accent }]}>
                <ThemedText style={[styles.initial, { color: theme.primary }]}>
                  {suggestion.name.slice(0, 1).toUpperCase()}
                </ThemedText>
              </View>
              <View style={styles.copy}>
                <ThemedText style={styles.name}>{suggestion.name}</ThemedText>
                {suggestion.description ? (
                  <ThemedText
                    themeColor="mutedForeground"
                    numberOfLines={1}
                    style={styles.description}
                  >
                    {suggestion.description}
                  </ThemedText>
                ) : null}
              </View>
              <View
                style={[
                  styles.actionIndicator,
                  { backgroundColor: theme.accent },
                  connected && styles.connectedIndicator,
                ]}
              >
                {connected ? (
                  <Check color={theme.primary} size={18} />
                ) : (
                  <Plus color={theme.primary} size={18} />
                )}
              </View>
            </>
          );

          return connected ? (
            <View
              key={suggestion.slug}
              accessibilityLabel={`${suggestion.name} is connected`}
              style={rowStyle}
            >
              {content}
            </View>
          ) : (
            <Pressable
              key={suggestion.slug}
              accessibilityRole="button"
              accessibilityLabel={`Connect ${suggestion.name}`}
              onPress={() => router.push("/(app)/connected-apps")}
              style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
            >
              {content}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two, paddingTop: Spacing.one },
  list: { overflow: "hidden", borderRadius: Radius.xl },
  suggestionRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
  },
  icon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  initial: { fontFamily: Fonts.sansSemiBold, fontSize: 17 },
  copy: { flex: 1, gap: 2 },
  name: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  description: { fontSize: 12, lineHeight: 17 },
  actionIndicator: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
  },
  connectedIndicator: { opacity: 0.76 },
  pressed: { opacity: 0.64 },
});
