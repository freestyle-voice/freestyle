import { ScrollView, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
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
  const empty = !text && !partial;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {empty ? (
        <ThemedText themeColor="mutedForeground" style={styles.placeholder}>
          {placeholder}
        </ThemedText>
      ) : (
        <ThemedText style={styles.text}>
          {text}
          {text && partial ? " " : ""}
          <ThemedText style={[styles.text, { color: theme.mutedForeground }]}>
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
  text: { fontSize: 20, lineHeight: 30 },
  placeholder: { fontSize: 18, lineHeight: 28 },
});
