import { StyleSheet, Text, type TextProps } from "react-native";

import { Fonts, type ThemeColor } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type ThemedTextProps = TextProps & {
  type?:
    | "default"
    | "title"
    | "small"
    | "smallBold"
    | "subtitle"
    | "link"
    | "linkPrimary"
    | "code"
    | "eyebrow";
  themeColor?: ThemeColor;
};

export function ThemedText({
  style,
  type = "default",
  themeColor,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? "text"] },
        type === "default" && styles.default,
        type === "title" && styles.title,
        type === "small" && styles.small,
        type === "smallBold" && styles.smallBold,
        type === "subtitle" && styles.subtitle,
        type === "link" && styles.link,
        type === "linkPrimary" && [
          styles.linkPrimary,
          { color: theme.primary },
        ],
        type === "code" && styles.code,
        type === "eyebrow" && [
          styles.eyebrow,
          { color: theme.mutedForeground },
        ],
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  default: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
  },
  title: {
    fontSize: 32,
    fontWeight: "400",
    fontStyle: "italic",
    fontFamily: Fonts?.serif,
  },
  subtitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "400",
    fontStyle: "italic",
    fontFamily: Fonts?.serif,
  },
  link: {
    lineHeight: 22,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 22,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts?.mono,
    fontWeight: "500",
    fontSize: 12,
  },
  eyebrow: {
    fontFamily: Fonts?.mono,
    fontWeight: "600",
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
});
