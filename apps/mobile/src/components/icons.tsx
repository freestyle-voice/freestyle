/**
 * Lightweight vector-ish icons drawn with plain Views (no SVG dependency).
 * Kept deliberately minimal — just the few glyphs the UI needs — so the app
 * stays lean and the shapes render crisply at any color.
 */

import { StyleSheet, View } from "react-native";

/** A microphone: rounded capsule + stand + base. */
export function MicGlyph({
  color,
  size = 26,
}: {
  color: string;
  size?: number;
}) {
  const capsuleW = size * 0.42;
  const capsuleH = size * 0.6;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={{
          width: capsuleW,
          height: capsuleH,
          borderRadius: capsuleW / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: capsuleW * 1.5,
          height: capsuleW * 0.8,
          borderColor: color,
          borderWidth: size * 0.07,
          borderTopWidth: 0,
          borderBottomLeftRadius: capsuleW,
          borderBottomRightRadius: capsuleW,
          marginTop: -capsuleW * 0.5,
        }}
      />
      <View
        style={{
          width: size * 0.07,
          height: size * 0.14,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: capsuleW,
          height: size * 0.07,
          borderRadius: size * 0.04,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** A rounded square "stop" glyph. */
export function StopGlyph({
  color,
  size = 22,
}: {
  color: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: color,
      }}
    />
  );
}

/** A minimal sliders/settings glyph (two tracks with knobs). */
export function SettingsGlyph({
  color,
  size = 20,
}: {
  color: string;
  size?: number;
}) {
  const track = {
    height: size * 0.11,
    borderRadius: size * 0.06,
    backgroundColor: color,
  };
  const knob = {
    width: size * 0.26,
    height: size * 0.26,
    borderRadius: size * 0.13,
    backgroundColor: color,
  };
  return (
    <View
      style={{
        width: size,
        height: size,
        justifyContent: "center",
        gap: size * 0.22,
      }}
    >
      <View style={styles.trackRow}>
        <View style={[track, { flex: 1 }]} />
        <View style={[knob, { marginLeft: -size * 0.55 }]} />
      </View>
      <View style={styles.trackRow}>
        <View style={[track, { flex: 1 }]} />
        <View style={[knob, { marginLeft: -size * 0.2 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  trackRow: { flexDirection: "row", alignItems: "center" },
});
