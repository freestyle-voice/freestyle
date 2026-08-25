import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/** A quiet, motion-safe progress signal for work that is still in flight. */
export function RemixWorkingIndicator({ label }: { label: string }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const shimmer = useSharedValue(reduceMotion ? 0.5 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    shimmer.value = withRepeat(withTiming(1, { duration: 1_200 }), -1, false);
  }, [reduceMotion, shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-28, 48]) }],
  }));

  return (
    <View accessibilityLiveRegion="polite" style={styles.root}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.shimmerTrack, { backgroundColor: theme.muted }]}
      >
        <Animated.View
          style={[
            styles.shimmerSheen,
            { backgroundColor: theme.primary },
            shimmerStyle,
          ]}
        />
      </View>
      <ThemedText
        themeColor="mutedForeground"
        numberOfLines={1}
        style={styles.label}
      >
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    minHeight: 28,
  },
  shimmerTrack: {
    width: 38,
    height: 5,
    overflow: "hidden",
    borderRadius: Radius.full,
  },
  shimmerSheen: { width: 20, height: "100%", borderRadius: Radius.full },
  label: { fontFamily: Fonts.sansMedium, fontSize: 13 },
});
