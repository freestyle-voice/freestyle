import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";
import { fetchCloudUsage } from "@/lib/cloud/usage";

/**
 * Deep-link landing route for `freestyle://billing` — the return URL used by
 * both `startProCheckout` and `openBillingPortal` (see `@/lib/cloud/subscription`).
 * `WebBrowser.openAuthSessionAsync` should already close the in-app browser and
 * hand control back on its own, but if the OS routes the deep link here instead
 * (e.g. the browser was dismissed manually), this screen resolves it cleanly:
 * refresh the cached usage/plan and bounce back to Profile. Belt-and-suspenders.
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
