/**
 * Bottom navigation bar.
 *
 * Five equally-weighted icon buttons: History · Vocab · Home · Tone · Dict,
 * with Home centered. Transparent (no capsule / blur background), sitting
 * close to the bottom edge. The active tab is signalled by an olive tint AND a
 * small dot beneath the icon (plus a heavier stroke) — so selection reads
 * without relying on color alone.
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
      {/* Non-color cue: an active dot so selection reads without relying on
          the olive tint alone. Reserve the slot when unfocused to avoid a
          vertical shift. */}
      <View
        style={[
          styles.activeDot,
          { backgroundColor: focused ? theme.primary : "transparent" },
        ]}
      />
    </Pressable>
  );
}

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
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
      style={[
        styles.wrap,
        {
          // Sit just above the home indicator / bottom edge.
          paddingBottom: Math.max(insets.bottom - 10, 4),
        },
      ]}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: withAlpha(theme.card, 0.92),
            borderColor: theme.border,
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

/** Append an alpha channel to a #rrggbb hex color. */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

const BAR_HEIGHT = 52;

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: Spacing.four,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    height: BAR_HEIGHT,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.two,
    gap: 3,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
