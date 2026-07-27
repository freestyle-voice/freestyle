/**
 * Bottom navigation bar.
 *
 * Five equally-weighted icon buttons: History · Vocab · Home · Tone · Dict,
 * with Home centered. A rounded "bubble" sits behind the active tab and slides
 * horizontally to whichever tab is selected — the active icon contrasts inside
 * the bubble (accent background + dark icon), inactive icons are muted.
 *
 * The bubble is a shape/position cue independent of color, so selection reads
 * without relying on the olive tint alone (accessibility parity with the
 * previous dot indicator). Slide animation respects Reduce Motion.
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
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Layout, Radius, Spacing } from "@/constants/theme";
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

/** Horizontal inset inside each slot so the bubble reads as a pill, not a
 *  full-width block. */
const BUBBLE_INSET = 6;
/** Vertical inset — the bubble is slightly shorter than BAR_HEIGHT. */
const BUBBLE_V_INSET = 6;

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
        color={focused ? theme.accentForeground : theme.mutedForeground}
        size={24}
        strokeWidth={focused ? 2.4 : 2}
      />
    </Pressable>
  );
}

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const focusedName = state.routes[state.index]?.name;
  const activeIndex = ITEMS.findIndex((i) => i.name === focusedName);

  // --- Measure the row so the bubble knows how wide each slot is.
  const [rowWidth, setRowWidth] = useState(0);
  const slotWidth = rowWidth > 0 ? rowWidth / ITEMS.length : 0;

  const onRowLayout = useCallback((e: LayoutChangeEvent) => {
    setRowWidth(e.nativeEvent.layout.width);
  }, []);

  // --- Sliding bubble position.
  const bubbleX = useSharedValue(0);
  // Track whether we've placed the bubble at least once (skip the first
  // animation so it doesn't slide in from X=0 on mount).
  const placed = useRef(false);

  useEffect(() => {
    if (slotWidth <= 0 || activeIndex < 0) return;
    const target = slotWidth * activeIndex + BUBBLE_INSET;
    if (!placed.current) {
      // First placement — jump without animation.
      bubbleX.value = target;
      placed.current = true;
    } else {
      bubbleX.value = withTiming(target, {
        duration: reduceMotion ? 0 : 260,
      });
    }
  }, [activeIndex, slotWidth, bubbleX, reduceMotion]);

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: bubbleX.value }],
  }));

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

  const bubbleWidth = slotWidth > 0 ? slotWidth - BUBBLE_INSET * 2 : 0;

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
        {/* The sliding bubble — absolutely positioned behind the icons. */}
        <View style={styles.bubbleTrack} onLayout={onRowLayout}>
          {slotWidth > 0 && (
            <Animated.View
              style={[
                styles.bubble,
                {
                  width: bubbleWidth,
                  backgroundColor: theme.accent,
                },
                bubbleStyle,
              ]}
            />
          )}
        </View>

        {/* Icon row on top of the bubble. */}
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
    paddingHorizontal: Spacing.three,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: Layout.tabBarMaxWidth,
    height: BAR_HEIGHT,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  /** Covers the same area as the icon row so the measured width matches. */
  bubbleTrack: {
    position: "absolute",
    top: BUBBLE_V_INSET,
    bottom: BUBBLE_V_INSET,
    left: Spacing.two,
    right: Spacing.two,
  },
  bubble: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: Radius.full,
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.two,
  },
});
