import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";

/**
 * Deep-link landing route for `freestyle://billing`.
 *
 * Native In-App Purchases return through StoreKit/Play callbacks (handled by
 * `useProSubscription`), not a deep link, so this route is now only a defensive
 * catch-all: if anything routes here (an old link, a store deep link), refresh
 * the cached usage/plan and bounce back to Profile.
 */
export default function BillingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const theme = useTheme();

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["cloud-usage"] });
    router.replace("/(app)/profile");
  }, [queryClient, router]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
