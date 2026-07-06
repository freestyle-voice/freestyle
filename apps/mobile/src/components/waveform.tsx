import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const BAR_COUNT = 27;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 40;

interface WaveformProps {
  /** Live input level [0, 1], shared for smooth UI-thread animation. */
  level: SharedValue<number>;
  active: boolean;
}

function Bar({
  level,
  active,
  phase,
  index,
}: {
  level: SharedValue<number>;
  active: SharedValue<number>;
  phase: SharedValue<number>;
  index: number;
}) {
  const theme = useTheme();

  // A bell curve so the middle bars are tallest, tapering to the edges.
  const center = (BAR_COUNT - 1) / 2;
  const falloff = 1 - Math.abs(index - center) / center;
  const shape = 0.35 + 0.65 * falloff;

  const style = useAnimatedStyle(() => {
    // Travelling sine wave along the row for a lively, flowing motion.
    const wave = 0.5 + 0.5 * Math.sin(phase.value + index * 0.55);
    // Height blends the live level (loudness) with the wave (liveliness).
    const energy = level.value * 0.75 + wave * 0.25;
    const target = MIN_HEIGHT + energy * (MAX_HEIGHT - MIN_HEIGHT) * shape;
    const height = interpolate(active.value, [0, 1], [MIN_HEIGHT, target]);
    return {
      height,
      opacity: interpolate(active.value, [0, 1], [0.35, 1]),
    };
  });

  return (
    <Animated.View
      style={[styles.bar, { backgroundColor: theme.primary }, style]}
    />
  );
}

/** Soniox-style live audio visualizer: a flowing row of level-driven bars. */
export function Waveform({ level, active }: WaveformProps) {
  const activeSv = useSharedValue(0);
  const phase = useSharedValue(0);
  // Smooth the raw level a touch so bars glide rather than jitter.
  const smoothed = useDerivedValue(() =>
    withTiming(level.value, { duration: 90 }),
  );

  useEffect(() => {
    activeSv.value = withTiming(active ? 1 : 0, { duration: 260 });
    if (active) {
      phase.value = withRepeat(
        withTiming(Math.PI * 2, { duration: 1100, easing: Easing.linear }),
        -1,
      );
    }
  }, [active, activeSv, phase]);

  return (
    <View style={styles.row}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <Bar
          key={i}
          level={smoothed}
          active={activeSv}
          phase={phase}
          index={i}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: MAX_HEIGHT + 8,
  },
  bar: { width: 3.5, borderRadius: Radius.full },
});
