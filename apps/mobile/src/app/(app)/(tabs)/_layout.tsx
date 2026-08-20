import { NativeTabs } from "expo-router/unstable-native-tabs";

import { useTheme } from "@/hooks/use-theme";

/** The five primary places in the Remix-first mobile experience. */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <NativeTabs
      backgroundColor={theme.background}
      iconColor={{ default: theme.mutedForeground, selected: theme.primary }}
      labelStyle={{
        default: { color: theme.mutedForeground, fontSize: 12 },
        selected: { color: theme.primary, fontSize: 12, fontWeight: "600" },
      }}
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          md={{ default: "home", selected: "home" }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "clock", selected: "clock.fill" }}
          md={{ default: "history", selected: "history" }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="keyboard">
        <NativeTabs.Trigger.Label>Keyboard</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "keyboard", selected: "keyboard.fill" }}
          md={{ default: "keyboard", selected: "keyboard" }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="words">
        <NativeTabs.Trigger.Label>Words</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: "text.book.closed",
            selected: "text.book.closed.fill",
          }}
          md={{ default: "dictionary", selected: "dictionary" }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: "person.crop.circle",
            selected: "person.crop.circle.fill",
          }}
          md={{ default: "person", selected: "account_circle" }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
