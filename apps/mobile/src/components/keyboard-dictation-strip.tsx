/**
 * A slim, always-on-top status strip that reflects the resident keyboard
 * dictation session. It appears only while a session is active (armed →
 * capturing → finalizing → ready) and tells the user what's happening plus the
 * one manual step iOS forces on us: switching back to their app.
 *
 * It deliberately does NOT own the session (the provider does) and carries no
 * transcript editing UI — the transcript is inserted by the keyboard. This is
 * the "minimal status strip" the user sees on the first cold arm; afterwards it
 * just floats above whatever screen is showing.
 */

import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { Phase } from "@/lib/keyboard/dictation-bridge";
import { useKeyboardDictation } from "@/lib/keyboard/keyboard-dictation-provider";

export function KeyboardDictationStrip() {
  const session = useKeyboardDictation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  const active = session?.active ?? false;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: active ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [active, opacity]);

  if (!session || !active) return null;

  const { phase, partial } = session;
  const dotColor =
    phase === "capturing" ? theme.primary : theme.mutedForeground;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + Spacing.one, opacity }]}
    >
      <Pressable
        onPress={session.toggle}
        style={[
          styles.pill,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={styles.copy}>
          <ThemedText style={styles.title}>{titleFor(phase)}</ThemedText>
          <ThemedText themeColor="mutedForeground" style={styles.hint}>
            {phase === "capturing" && partial ? partial : hintFor(phase)}
          </ThemedText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function titleFor(phase: Phase): string {
  switch (phase) {
    case "arming":
      return "Waking up…";
    case "armed":
      return "Ready to dictate";
    case "capturing":
      return "Listening";
    case "transcribing":
      return "Polishing";
    case "ready":
      return "Inserted";
    case "failed":
      return "Something went wrong";
    default:
      return "Freestyle";
  }
}

function hintFor(phase: Phase): string {
  switch (phase) {
    case "arming":
      return "Starting your mic";
    case "armed":
      return "Switch back to your app and tap the mic";
    case "capturing":
      return "Tap the keyboard mic when you're done";
    case "transcribing":
      return "Cleaning up your words";
    case "ready":
      return "Switch back — your text is in";
    case "failed":
      return "Tap to try again";
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
    paddingHorizontal: Spacing.three,
    maxWidth: 420,
    width: "100%",
    // Subtle lift.
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  copy: { flex: 1 },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  hint: { fontSize: 12, lineHeight: 16 },
});
