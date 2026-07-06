import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { MicGlyph, StopGlyph } from "@/components/icons";
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

/** The primary press-and-hold / tap-to-toggle record control. */
export function MicButton({
  state,
  level,
  onPressIn,
  onPressOut,
}: MicButtonProps) {
  const theme = useTheme();
  const press = useSharedValue(1);
  // A continuous breathing driver for the halo while recording, so the rings
  // move even during silence and swell further with the live level.
  const breathe = useSharedValue(0);
  const recording = useSharedValue(0);

  useEffect(() => {
    recording.value = withTiming(state === "recording" ? 1 : 0, {
      duration: 260,
    });
    if (state === "recording") {
      breathe.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
    } else {
      breathe.value = withTiming(0, { duration: 300 });
    }
  }, [state, breathe, recording]);

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  // Two rings at different phases give a layered "sonar" pulse. Each expands
  // with breathe + live level and fades as it grows.
  const ringOuter = useAnimatedStyle(() => {
    const drive = (breathe.value + level.value * 1.2) * recording.value;
    const scale = 1 + interpolate(drive, [0, 1.2], [0.05, 0.7]);
    return {
      transform: [{ scale }],
      opacity: recording.value * interpolate(scale, [1, 1.7], [0.5, 0]),
    };
  });

  const ringInner = useAnimatedStyle(() => {
    const drive = (breathe.value + level.value * 1.2) * recording.value;
    const scale = 1 + interpolate(drive, [0, 1.2], [0.05, 0.7]) * 0.6;
    return {
      transform: [{ scale }],
      opacity: recording.value * interpolate(scale, [1, 1.42], [0.6, 0]),
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
            <StopGlyph color={fg} size={26} />
          ) : (
            <MicGlyph color={fg} size={30} />
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
