import { Mic, Square } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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

export type MicState = "idle" | "recording" | "finalizing";

interface MicButtonProps {
  state: MicState;
  /** Live input level [0, 1], shared for smooth UI-thread animation. */
  level: SharedValue<number>;
  onPressIn: () => void;
  onPressOut: () => void;
}

const SIZE = 92;

// Fast attack, slow decay so the halo swells sharply with speech and settles
// gently — same feel as the waveform, so both react to real loudness.
const ATTACK = 0.5;
const DECAY = 0.14;

/** The primary press-and-hold / tap-to-toggle record control. */
export function MicButton({
  state,
  level,
  onPressIn,
  onPressOut,
}: MicButtonProps) {
  const theme = useTheme();
  const press = useSharedValue(1);
  const recording = useSharedValue(0);

  useEffect(() => {
    recording.value = withTiming(state === "recording" ? 1 : 0, {
      duration: 260,
    });
  }, [state, recording]);

  // Smoothed loudness (fast attack / slow decay) drives the halo. No idle
  // breathing loop: when the user is silent the rings collapse to the button
  // edge, so the pulse depicts the voice, not a decorative animation.
  const drive = useSharedValue(0);
  useDerivedValue(() => {
    const next = level.value * recording.value;
    const prev = drive.value;
    const k = next > prev ? ATTACK : DECAY;
    drive.value = prev + (next - prev) * k;
  });

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  // Two rings at slightly different reach give a layered "sonar" swell that
  // grows with loudness and fades as it expands.
  const ringOuter = useAnimatedStyle(() => {
    const scale = 1 + interpolate(drive.value, [0, 1], [0, 0.7]);
    return {
      transform: [{ scale }],
      opacity: recording.value * interpolate(scale, [1, 1.7], [0.55, 0]),
    };
  });

  const ringInner = useAnimatedStyle(() => {
    const scale = 1 + interpolate(drive.value, [0, 1], [0, 0.42]);
    return {
      transform: [{ scale }],
      opacity: recording.value * interpolate(scale, [1, 1.42], [0.65, 0]),
    };
  });

  const handlePressIn = () => {
    press.value = withTiming(0.93, { duration: 90 });
    onPressIn();
  };
  const handlePressOut = () => {
    press.value = withTiming(1, { duration: 140 });
    onPressOut();
  };

  const bg =
    state === "recording"
      ? theme.destructive
      : state === "finalizing"
        ? theme.muted
        : theme.primary;
  const haloColor = state === "recording" ? theme.destructive : theme.primary;
  const fg =
    state === "finalizing" ? theme.mutedForeground : theme.primaryForeground;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.ring, { backgroundColor: `${haloColor}22` }, ringOuter]}
      />
      <Animated.View
        style={[styles.ring, { backgroundColor: `${haloColor}33` }, ringInner]}
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
          style={[
            styles.button,
            { backgroundColor: bg, shadowColor: haloColor },
          ]}
        >
          {state === "recording" ? (
            <Square color={fg} fill={fg} size={22} />
          ) : (
            <Mic color={fg} size={30} />
          )}
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
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    // Soft colored glow lifts the button off the dark background.
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
