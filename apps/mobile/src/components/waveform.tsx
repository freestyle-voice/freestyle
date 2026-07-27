import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const BAR_COUNT = 27;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 40;

// Asymmetric smoothing (mirrors the desktop pill): bars snap up quickly toward
// a louder level and fall back gently — the classic "fast attack, slow decay"
// equalizer feel. This is what makes the meter read as real loudness rather
// than a decorative animation.
const ATTACK = 0.5; // rise toward a louder level
const DECAY = 0.16; // fall toward a quieter level

interface WaveformProps {
  /** Live input level [0, 1], shared for smooth UI-thread animation. */
  level: SharedValue<number>;
  active: boolean;
}

function Bar({
  level,
  active,
  index,
}: {
  level: SharedValue<number>;
  active: SharedValue<number>;
  index: number;
}) {
  const theme = useTheme();

  // A bell curve so the middle bars are tallest, tapering to the edges — the
  // silhouette matches the desktop pill's Gaussian shape.
  const center = (BAR_COUNT - 1) / 2;
  const falloff = 1 - Math.abs(index - center) / center;
  const shape = 0.35 + 0.65 * falloff;

  // Tiny fixed per-bar offset so adjacent bars don't move in perfect lockstep.
  // Deterministic (not random per frame) so the row looks organic but stable.
  const jitter = 0.9 + 0.2 * ((Math.sin(index * 12.9898) + 1) / 2);

  const style = useAnimatedStyle(() => {
    // Height is driven purely by loudness (× the bar's static shape). When the
    // user is silent the level is ~0, so bars sit at MIN_HEIGHT — no motion.
    const energy = level.value * shape * jitter;
    const target = MIN_HEIGHT + energy * (MAX_HEIGHT - MIN_HEIGHT);
    const height = interpolate(active.value, [0, 1], [MIN_HEIGHT, target]);
    return {
      height,
      // Louder → more opaque, so intensity reads even at a glance.
      opacity: interpolate(
        active.value,
        [0, 1],
        [0.3, 0.6 + level.value * 0.4],
      ),
    };
  });

  return (
    <Animated.View
      style={[styles.bar, { backgroundColor: theme.primary }, style]}
    />
  );
}

/**
 * Live audio visualizer: a row of bars whose heights track the actual mic
 * loudness. Unlike a decorative equalizer, this depicts how loud the user is
 * speaking — bars rise sharply on speech and settle back during pauses, and sit
 * flat when silent. Mirrors the desktop pill's level-driven, fast-attack /
 * slow-decay behavior.
 */
export function Waveform({ level, active }: WaveformProps) {
  const activeSv = useSharedValue(0);
  // Smoothed loudness with asymmetric attack/decay. Kept in its own shared
  // value (rather than reading a derived value's own prior output) so the UI
  // thread has a stable, well-typed accumulator.
  const smoothed = useSharedValue(0);
  useDerivedValue(() => {
    const next = level.value;
    const prev = smoothed.value;
    const k = next > prev ? ATTACK : DECAY;
    smoothed.value = prev + (next - prev) * k;
  });

  useEffect(() => {
    activeSv.value = withTiming(active ? 1 : 0, { duration: 260 });
  }, [active, activeSv]);

  return (
    <View style={styles.row}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <Bar key={i} level={smoothed} active={activeSv} index={i} />
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
