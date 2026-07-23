import { Tabs } from "expo-router";

import { FloatingTabBar } from "@/components/floating-tab-bar";

/**
 * The five bottom-tab destinations. Pushed pages (settings, profile, keyboard
 * setup) live in the parent Stack so navigating to them preserves the
 * active tab and lets Back return here.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="vocabulary" options={{ title: "Vocabulary" }} />
      <Tabs.Screen name="tone" options={{ title: "Cleanup & Tone" }} />
      <Tabs.Screen name="dictionary" options={{ title: "Dictionary" }} />
    </Tabs>
  );
}
