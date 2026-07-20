/**
 * Docked navigation bar.
 *
 * A single rounded, elevated capsule floating above the bottom edge with five
 * equally-weighted icon buttons: History · Vocab · Home · Tone · Dict. Home
 * sits in the center. The active tab tints olive; there are no text labels and
 * no active dot — the color change alone signals selection.
 *
 * Recording lives on the Home screen itself; the center Home button is simply
 * how you return to it from any other tab.
 */

import { useRouter } from "expo-router";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import {
  BookOpen,
  Clock,
  Home,
  type LucideIcon,
  Replace,
  Sparkles,
} from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

interface NavSpec {
  name: string;
  label: string;
  icon: LucideIcon;
}

// History · Vocab · Home · Tone · Dict — Home centered.
const ITEMS: NavSpec[] = [
  { name: "history", label: "History", icon: Clock },
  { name: "vocabulary", label: "Vocab", icon: BookOpen },
  { name: "index", label: "Home", icon: Home },
  { name: "tone", label: "Tone", icon: Sparkles },
  { name: "dictionary", label: "Dict", icon: Replace },
];

function NavButton({
  spec,
  focused,
  onPress,
}: {
  spec: NavSpec;
  focused: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const Icon = spec.icon;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={spec.label}
      onPress={onPress}
      hitSlop={10}
      style={styles.navButton}
    >
      <Icon
        color={focused ? theme.primary : theme.mutedForeground}
        size={24}
        strokeWidth={focused ? 2.4 : 2}
      />
    </Pressable>
  );
}

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const focusedName = state.routes[state.index]?.name;

  const go = (name: string) => {
    if (name === "index") {
      // Home is not a rendered tab route from a nav standpoint; route to it.
      if (focusedName !== "index") router.navigate("/(app)");
      return;
    }
    const target = state.routes.find((r) => r.name === name);
    if (!target) return;
    const event = navigation.emit({
      type: "tabPress",
      target: target.key,
      canPreventDefault: true,
    });
    if (focusedName !== name && !event.defaultPrevented) {
      navigation.navigate(name);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.card,
            borderColor: theme.cardRing,
            shadowColor: theme.foreground,
          },
        ]}
      >
        {ITEMS.map((spec) => (
          <NavButton
            key={spec.name}
            spec={spec}
            focused={focusedName === spec.name}
            onPress={() => go(spec.name)}
          />
        ))}
      </View>
    </View>
  );
}

const BAR_HEIGHT = 64;

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: Spacing.three,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    height: BAR_HEIGHT,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius["2xl"] + 8,
    borderWidth: 1,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.two,
  },
});
