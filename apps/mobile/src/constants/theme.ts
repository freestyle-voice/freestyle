/**
 * Freestyle design tokens, lifted from DESIGN.md / the desktop app's globals.css.
 * Warm paper substrate, near-black ink, olive accent. Never pure white/black.
 */

export const Colors = {
  light: {
    background: "#F4F0E4", // warm paper
    foreground: "#16140F", // near-black ink
    card: "#FBF8EE",
    primary: "#6B8F12", // olive accent
    primaryForeground: "#FBF8EE",
    secondary: "#ECE7D6",
    muted: "#ECE7D6",
    mutedForeground: "#7B7461",
    accent: "#E8EFC9",
    accentForeground: "#2E3F05",
    destructive: "#DD6E4E",
    border: "#D6CDB8",
    // Cloud's `ring-foreground/10` — ink at 10%, for the faint card hairline.
    cardRing: "rgba(22, 20, 15, 0.10)",
    // Cloud's destructive button: bg-destructive/10 → /20 on press.
    destructiveTint: "rgba(221, 110, 78, 0.10)",
    destructiveTintPressed: "rgba(221, 110, 78, 0.20)",
    // Cloud's `--input` — the switch-off track / input border.
    switchTrack: "#E3DCC8",
  },
  dark: {
    background: "#16140F",
    foreground: "#ECE7D6",
    card: "#1E1C16",
    primary: "#8AB62A", // brighter olive for contrast
    primaryForeground: "#16140F",
    secondary: "#2A2720",
    muted: "#2A2720",
    mutedForeground: "#9E977F",
    accent: "#2E3F05",
    accentForeground: "#E8EFC9",
    destructive: "#E0805F",
    border: "#3A362D",
    // Cloud's `ring-foreground/10` in dark — cream at 10%.
    cardRing: "rgba(236, 231, 214, 0.10)",
    // Cloud's destructive button in dark: bg-destructive/20 → /30 on press.
    destructiveTint: "rgba(224, 128, 95, 0.18)",
    destructiveTintPressed: "rgba(224, 128, 95, 0.28)",
    // Cloud's `--input` in dark — the switch-off track / input border.
    switchTrack: "#3A362D",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Three families, three jobs (DESIGN.md §3):
 * - Instrument Serif → display / page titles (the signature italic accent word)
 * - DM Sans → body & UI
 * - JetBrains Mono → uppercase, tracked micro-labels
 */
export const Fonts = {
  serif: "InstrumentSerif_400Regular",
  serifItalic: "InstrumentSerif_400Regular_Italic",
  sans: "DMSans_400Regular",
  sansMedium: "DMSans_500Medium",
  sansSemiBold: "DMSans_600SemiBold",
  mono: "JetBrainsMono_400Regular",
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  "2xl": 18,
  full: 999,
} as const;
