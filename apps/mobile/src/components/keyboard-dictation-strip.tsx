/**
 * A slim, floating status strip that reflects the resident keyboard dictation
 * session while the app is in the foreground.
 *
 * It surfaces ONLY the two "something is happening" phases — `capturing`
 * (listening) and `transcribing` (processing) — not the armed/ready/idle
 * states. Those in-between states are the keyboard's job to show; on the app we
 * keep the strip out of the way unless there's live activity to report.
 *
 * It deliberately does NOT own the session (the provider does) and carries no
 * transcript editing UI — the transcript is inserted by the keyboard. Tapping
 * the body toggles capture (start/stop); the trailing close button dismisses
 * the session (releases the mic) and hides the strip.
 *
 * Anchored to the BOTTOM, floating above the safe area — not the top, where it
 * would cover each screen's header. The chat-first app no longer reserves a
 * permanent tab dock, so it has one consistent position on every screen.
 */

import { Loader, Mic, X } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { Phase } from "@/lib/keyboard/dictation-bridge";
import { useKeyboardDictation } from "@/lib/keyboard/keyboard-dictation-provider";

/** Show the strip whenever the session is live — warm mic, active capture, or
 *  processing. Hidden only for `idle` (no session) and `failed` (already reset). */
function isVisiblePhase(phase: Phase): boolean {
  return (
    phase === "arming" ||
    phase === "armed" ||
    phase === "capturing" ||
    phase === "transcribing" ||
    phase === "ready"
  );
}

export function KeyboardDictationStrip() {
  const session = useKeyboardDictation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;

  const phase: Phase = session?.phase ?? "idle";
  const visible = (session?.active ?? false) && isVisiblePhase(phase);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: reduceMotion ? 0 : 180,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity, reduceMotion]);

  if (!session || !visible) return null;

  const { partial } = session;
  const iconColor =
    phase === "capturing" ? theme.primary : theme.mutedForeground;

  const bottom = Math.max(insets.bottom, Spacing.two) + Spacing.two;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom, opacity }]}
    >
      <View
        style={[
          styles.pill,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <Pressable
          onPress={session.toggle}
          style={styles.body}
          accessibilityRole="button"
          accessibilityLabel={
            phase === "capturing" ? "Stop dictation" : "Dictation status"
          }
        >
          <PhaseIcon
            phase={phase}
            color={iconColor}
            reduceMotion={reduceMotion}
          />
          <View style={styles.copy}>
            <ThemedText style={styles.title}>{titleFor(phase)}</ThemedText>
            <ThemedText themeColor="mutedForeground" style={styles.hint}>
              {phase === "capturing" && partial ? partial : hintFor(phase)}
            </ThemedText>
          </View>
        </Pressable>
        <Pressable
          onPress={session.dismiss}
          hitSlop={10}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Dismiss dictation"
        >
          <X color={theme.mutedForeground} size={16} strokeWidth={2.4} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

/**
 * The leading phase icon: a mic while listening, and a spinning loader while
 * processing (spin suppressed under Reduce Motion — a static loader still reads
 * as "working").
 */
function PhaseIcon({
  phase,
  color,
  reduceMotion,
}: {
  phase: Phase;
  color: string;
  reduceMotion: boolean;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const spinning = phase === "transcribing" && !reduceMotion;

  useEffect(() => {
    if (!spinning) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [spinning, spin]);

  if (phase === "transcribing") {
    const rotate = spin.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "360deg"],
    });
    return (
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Loader color={color} size={16} strokeWidth={2.4} />
      </Animated.View>
    );
  }
  return <Mic color={color} size={16} strokeWidth={2.4} />;
}

function titleFor(phase: Phase): string {
  switch (phase) {
    case "arming":
      return "Starting mic…";
    case "armed":
    case "ready":
      return "Mic ready";
    case "capturing":
      return "Listening";
    case "transcribing":
      return "Processing";
    default:
      return "Freestyle";
  }
}

function hintFor(phase: Phase): string {
  switch (phase) {
    case "arming":
      return "One moment";
    case "armed":
    case "ready":
      return "Tap to speak, or close to stop";
    case "capturing":
      return "Tap to stop, or use the keyboard mic";
    case "transcribing":
      return "Cleaning up your words";
    default:
      return "";
  }
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: Spacing.three,
    right: Spacing.three,
    zIndex: 50,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    maxWidth: 420,
    width: "100%",
    // Subtle lift — shadow above, since the strip floats over content near
    // the bottom edge.
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 4,
  },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  copy: { flex: 1 },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  hint: { fontSize: 12, lineHeight: 16 },
  close: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
