import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#16140F",
    textSecondary: "#34302A",
    textTertiary: "#7B7461",
    background: "#F4F0E4",
    backgroundElement: "#ECE7D6",
    backgroundSelected: "#E3DCC8",
    primary: "#6B8F12",
    primaryLight: "#E8EFC9",
    primaryForeground: "#FBF8EE",
    danger: "#DD6E4E",
    dangerLight: "rgba(221,110,78,0.1)",
    dangerForeground: "#FBF8EE",
    success: "#6B8F12",
    successLight: "#E8EFC9",
    warning: "#FBBF24",
    border: "#D6CDB8",
    input: "#E3DCC8",
    cardBackground: "#FBF8EE",
    accent: "#E8EFC9",
    accentForeground: "#2E3F05",
    muted: "#ECE7D6",
    mutedForeground: "#7B7461",
  },
  dark: {
    text: "#ECE7D6",
    textSecondary: "#B5AD99",
    textTertiary: "#9E977F",
    background: "#16140F",
    backgroundElement: "#2A2720",
    backgroundSelected: "#3A362D",
    primary: "#8AB62A",
    primaryLight: "#2E3F05",
    primaryForeground: "#FBF8EE",
    danger: "#E0805F",
    dangerLight: "rgba(224,128,95,0.1)",
    dangerForeground: "#FBF8EE",
    success: "#8AB62A",
    successLight: "#2E3F05",
    warning: "#FBBF24",
    border: "#3A362D",
    input: "#3A362D",
    cardBackground: "#1E1C16",
    accent: "#2E3F05",
    accentForeground: "#E8EFC9",
    muted: "#2A2720",
    mutedForeground: "#9E977F",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    sans: "System",
    serif: "Georgia",
    mono: "Menlo",
  },
  default: {
    sans: "normal",
    serif: "serif",
    mono: "monospace",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 48,
} as const;

export const Radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  full: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
