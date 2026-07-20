/**
 * Bottom navigation bar.
 *
 * Five equally-weighted icon buttons: History · Vocab · Home · Tone · Dict,
 * with Home centered. Transparent (no capsule / blur background), sitting
 * close to the bottom edge. The active tab tints olive; no text labels and no
 * active dot — color alone signals selection.
 *
 * Recording lives on the Home screen itself; the center Home button is simply
 * how you return to it from any other tab.
 */

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

import { Spacing } from "@/constants/theme";
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
  const insets = useSafeAreaInsets();

  const focusedName = state.routes[state.index]?.name;

  const go = (name: string) => {
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
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 6) }]}
    >
      <View style={styles.bar}>
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

const BAR_HEIGHT = 56;

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
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.two,
  },
});
