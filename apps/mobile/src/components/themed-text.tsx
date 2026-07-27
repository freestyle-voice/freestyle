import { StyleSheet, Text, type TextProps } from "react-native";

import { Fonts, type ThemeColor } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type ThemedTextType =
  | "body"
  | "title"
  | "display"
  | "displayItalic"
  | "eyebrow";

export type ThemedTextProps = TextProps & {
  type?: ThemedTextType;
  themeColor?: ThemeColor;
};

export function ThemedText({
  style,
  type = "body",
  themeColor,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? "foreground"] },
        type === "body" && styles.body,
        type === "title" && styles.title,
        type === "display" && styles.display,
        type === "displayItalic" && styles.displayItalic,
        type === "eyebrow" && styles.eyebrow,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  body: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 21,
  },
  // Instrument Serif screen title — smaller than the display hero.
  title: {
    fontFamily: Fonts.serif,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  // Instrument Serif display — the signature page title.
  display: {
    fontFamily: Fonts.serif,
    fontSize: 72,
    lineHeight: 72,
    letterSpacing: -1.8,
  },
  displayItalic: {
    fontFamily: Fonts.serifItalic,
    fontSize: 72,
    lineHeight: 72,
    letterSpacing: -0.9,
  },
  // JetBrains Mono micro-label — uppercase + widely tracked.
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
});
