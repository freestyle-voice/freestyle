import { ScrollView, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useResponsive } from "@/hooks/use-responsive";
import { useTheme } from "@/hooks/use-theme";

interface TranscriptViewProps {
  /** Committed, cleaned text. */
  text: string;
  /** In-flight partial from the current utterance (rendered muted). */
  partial: string;
  placeholder: string;
}

/** Scrollable transcript: settled text in ink, live partial in muted grey. */
export function TranscriptView({
  text,
  partial,
  placeholder,
}: TranscriptViewProps) {
  const theme = useTheme();
  const { transcriptSize, transcriptPlaceholderSize } = useResponsive();
  const empty = !text && !partial;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {empty ? (
        <ThemedText
          themeColor="mutedForeground"
          style={[
            styles.placeholder,
            {
              fontSize: transcriptPlaceholderSize,
              lineHeight: transcriptPlaceholderSize + 10,
            },
          ]}
        >
          {placeholder}
        </ThemedText>
      ) : (
        <ThemedText
          style={[
            styles.text,
            { fontSize: transcriptSize, lineHeight: transcriptSize + 10 },
          ]}
        >
          {text}
          {text && partial ? " " : ""}
          <ThemedText
            style={[
              styles.text,
              {
                color: theme.mutedForeground,
                fontSize: transcriptSize,
                lineHeight: transcriptSize + 10,
              },
            ]}
          >
            {partial}
          </ThemedText>
        </ThemedText>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingVertical: Spacing.three },
  text: {},
  placeholder: {},
});
