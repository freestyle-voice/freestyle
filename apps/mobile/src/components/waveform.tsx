import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/use-theme";

const BARS = 5;

function Bar({
  level,
  index,
  active,
}: {
  level: number;
  index: number;
  active: boolean;
}) {
  const theme = useTheme();
  const height = useSharedValue(6);

  useEffect(() => {
    // Each bar reacts to the level with a small per-bar offset so the row
    // breathes rather than moving in lockstep.
    const offset = 0.6 + 0.4 * Math.sin(index * 1.7);
    const target = active ? 6 + level * 40 * offset : 6;
    height.value = withTiming(Math.max(6, target), { duration: 120 });
  }, [level, index, active, height]);

  const style = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: active ? theme.primary : theme.border },
        style,
      ]}
    />
  );
}

/** Five-bar live input-level visualizer shown while recording. */
export function Waveform({
  level,
  active,
}: {
  level: number;
  active: boolean;
}) {
  return (
    <View style={styles.row}>
      {Array.from({ length: BARS }).map((_, i) => (
        <Bar key={i} level={level} index={i} active={active} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 48,
  },
  bar: { width: 6, borderRadius: 3 },
});
