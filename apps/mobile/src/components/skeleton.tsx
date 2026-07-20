import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

interface SkeletonProps {
  width: number;
  height?: number;
  radius?: number;
}

/**
 * A muted placeholder block that gently pulses while data loads. Uses the
 * theme's `muted` fill and a subtle opacity breathe on the UI thread — no
 * spinners, in keeping with the calm editorial aesthetic (DESIGN.md §8).
 */
export function Skeleton({
  width,
  height = 16,
  radius = Radius.sm,
}: SkeletonProps) {
  const theme = useTheme();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [pulse]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        { width, height, borderRadius: radius, backgroundColor: theme.muted },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  block: { overflow: "hidden" },
});
