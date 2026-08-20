import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";
import { fetchCloudUsage } from "@/lib/cloud/usage";

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
    // Fetch fresh (bypass the cloud plan cache) since we just returned from a
    // checkout/portal — the plan may have just changed. Best-effort: a failed
    // refresh shouldn't block the bounce back to Profile.
    void queryClient
      .fetchQuery({
        queryKey: ["cloud-usage"],
        queryFn: () => fetchCloudUsage({ fresh: true }),
      })
      .catch(() => {});
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
