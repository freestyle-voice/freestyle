import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";

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
