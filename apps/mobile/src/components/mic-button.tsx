import { useCallback, useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type MicState = "idle" | "recording" | "finalizing";

interface MicButtonProps {
  state: MicState;
  /** Live input level [0, 1] used to size the ring while recording. */
  level: number;
  onPressIn: () => void;
  onPressOut: () => void;
}

const SIZE = 88;

/** The primary press-and-hold / tap-to-toggle record control. */
export function MicButton({
  state,
  level,
  onPressIn,
  onPressOut,
}: MicButtonProps) {
  const theme = useTheme();
  const pulse = useSharedValue(1);
  const press = useSharedValue(1);

  useEffect(() => {
    if (state === "recording") {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.35, { duration: 900 }),
          withTiming(1, { duration: 900 }),
        ),
        -1,
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [state, pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value + level * 0.4 }],
    opacity: state === "recording" ? 0.9 - level * 0.3 : 0,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  const handlePressIn = useCallback(() => {
    press.value = withTiming(0.94, { duration: 90 });
    onPressIn();
  }, [press, onPressIn]);

  const handlePressOut = useCallback(() => {
    press.value = withTiming(1, { duration: 90 });
    onPressOut();
  }, [press, onPressOut]);

  const color =
    state === "recording"
      ? theme.destructive
      : state === "finalizing"
        ? theme.mutedForeground
        : theme.primary;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.ring,
          { borderColor: color, backgroundColor: `${color}18` },
          ringStyle,
        ]}
      />
      <Animated.View style={buttonStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            state === "recording" ? "Stop recording" : "Start recording"
          }
          disabled={state === "finalizing"}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[styles.button, { backgroundColor: color }]}
        >
          <ThemedText
            style={[styles.glyph, { color: theme.primaryForeground }]}
          >
            {state === "recording" ? "◼" : "●"}
          </ThemedText>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE * 2,
    height: SIZE * 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: Radius.full,
    borderWidth: 2,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: { fontSize: 30, lineHeight: 34 },
});
