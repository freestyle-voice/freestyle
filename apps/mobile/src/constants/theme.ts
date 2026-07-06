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
  monoMedium: "JetBrainsMono_500Medium",
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const MaxContentWidth = 800;
