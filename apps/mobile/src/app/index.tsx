import { Redirect } from "expo-router";
import { ActivityIndicator } from "react-native";

import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";

export default function Index() {
  const theme = useTheme();
  const { signedIn, loading } = useAuth();

  if (loading) {
    return (
      <ThemedView
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  return <Redirect href={signedIn ? "/(app)/(tabs)" : "/sign-in"} />;
}
