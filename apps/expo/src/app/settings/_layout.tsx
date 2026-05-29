import { Stack } from "expo-router";
import { useTheme } from "@/hooks/use-theme";

export default function SettingsLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.primary,
        headerTitleStyle: {
          fontWeight: "500",
          fontSize: 16,
          color: theme.text,
        },
        headerShadowVisible: false,
        headerBackTitle: "Back",
      }}
    >
      <Stack.Screen name="api-keys" options={{ title: "API Keys" }} />
      <Stack.Screen name="models" options={{ title: "Models" }} />
      <Stack.Screen name="general" options={{ title: "General" }} />
      <Stack.Screen name="dictionary" options={{ title: "Dictionary" }} />
      <Stack.Screen name="formats" options={{ title: "Formats" }} />
      <Stack.Screen name="feedback" options={{ title: "Feedback" }} />
    </Stack>
  );
}
