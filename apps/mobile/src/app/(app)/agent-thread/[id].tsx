import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Card, SettingsScreenScaffold } from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { getThread } from "@/lib/remix/client";

export default function AgentThreadScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    data: thread,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["agent-thread", id],
    queryFn: () => getThread(id),
    enabled: Boolean(id),
    retry: 1,
  });

  return (
    <SettingsScreenScaffold title="Remix conversation">
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <ThemedText themeColor="mutedForeground">
            Loading conversation…
          </ThemedText>
        </View>
      ) : error || !thread ? (
        <Card>
          <ThemedText themeColor="mutedForeground" style={styles.empty}>
            This conversation is no longer available.
          </ThemedText>
        </Card>
      ) : (
        thread.messages.map((message) => {
          const text = message.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("");
          if (!text) return null;
          return (
            <Card key={message.id}>
              <ThemedText type="eyebrow" themeColor="mutedForeground">
                {message.role === "user" ? "YOU" : "REMIX"}
              </ThemedText>
              <ThemedText style={styles.message}>{text}</ThemedText>
            </Card>
          );
        })
      )}
    </SettingsScreenScaffold>
  );
}

const styles = StyleSheet.create({
  loading: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  empty: { fontSize: 14, lineHeight: 21 },
  message: { fontFamily: Fonts.sans, fontSize: 15, lineHeight: 23 },
});
