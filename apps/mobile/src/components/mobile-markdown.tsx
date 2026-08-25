import { StyleSheet, Text, View } from "react-native";

import { Fonts, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { markdownBlocks } from "@/lib/remix/markdown";

function InlineMarkdown({ text }: { text: string }) {
  const theme = useTheme();
  const segments = text.split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__)/g);
  return (
    <Text style={[styles.body, { color: theme.foreground }]}>
      {segments.map((segment, index) => {
        if (segment.startsWith("`") && segment.endsWith("`")) {
          return (
            <Text
              key={index}
              style={[styles.inlineCode, { backgroundColor: theme.secondary }]}
            >
              {segment.slice(1, -1)}
            </Text>
          );
        }
        if (
          (segment.startsWith("**") && segment.endsWith("**")) ||
          (segment.startsWith("__") && segment.endsWith("__"))
        ) {
          return (
            <Text key={index} style={styles.strong}>
              {segment.slice(2, -2)}
            </Text>
          );
        }
        return segment;
      })}
    </Text>
  );
}

export function MobileMarkdown({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      {markdownBlocks(text).map((block, index) => {
        if (block.kind === "heading") {
          return (
            <Text
              key={index}
              style={[
                styles.heading,
                block.level === 1 && styles.headingOne,
                { color: theme.foreground },
              ]}
            >
              {block.text}
            </Text>
          );
        }
        if (block.kind === "code") {
          return (
            <Text
              key={index}
              style={[
                styles.code,
                { color: theme.foreground, backgroundColor: theme.secondary },
              ]}
            >
              {block.text}
            </Text>
          );
        }
        if (block.kind === "list") {
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={itemIndex} style={styles.listRow}>
                  <Text
                    style={[styles.marker, { color: theme.mutedForeground }]}
                  >
                    {block.ordered ? `${itemIndex + 1}.` : "•"}
                  </Text>
                  <View style={styles.listText}>
                    <InlineMarkdown text={item} />
                  </View>
                </View>
              ))}
            </View>
          );
        }
        return <InlineMarkdown key={index} text={block.text} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
  body: { fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22 },
  strong: { fontFamily: Fonts.sansSemiBold },
  inlineCode: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    borderRadius: 4,
    paddingHorizontal: 3,
  },
  heading: { fontFamily: Fonts.sansSemiBold, fontSize: 17, lineHeight: 23 },
  headingOne: { fontSize: 20, lineHeight: 26 },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    borderRadius: 8,
    padding: Spacing.two,
  },
  list: { gap: Spacing.one },
  listRow: { flexDirection: "row", gap: Spacing.two },
  marker: {
    width: 18,
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "right",
  },
  listText: { flex: 1 },
});
