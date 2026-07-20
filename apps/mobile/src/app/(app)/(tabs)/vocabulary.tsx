import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import {
  Card,
  SectionTitle,
  TabScreenScaffold,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  useEntries,
  VOCAB_NOTES_MAX,
  VOCAB_TERM_MAX,
  type VocabEntry,
} from "@/lib/entries";

export default function VocabularyScreen() {
  const theme = useTheme();
  const { vocabulary, addVocab, updateVocab, removeVocab } = useEntries();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [notes, setNotes] = useState("");

  const editing = editingId !== null;

  const startAdd = () => {
    setEditingId(null);
    setTerm("");
    setNotes("");
    setEditingId("new");
  };

  const startEdit = (entry: VocabEntry) => {
    setEditingId(entry.id);
    setTerm(entry.term);
    setNotes(entry.notes ?? "");
  };

  const cancel = () => {
    setEditingId(null);
    setTerm("");
    setNotes("");
  };

  const save = () => {
    if (!term.trim()) return;
    if (editingId && editingId !== "new") {
      updateVocab(editingId, term, notes);
    } else {
      addVocab(term, notes);
    }
    cancel();
  };

  return (
    <TabScreenScaffold
      title="Vocabulary"
      subtitle="Names, jargon, and phrases Freestyle should recognize. These bias speech recognition so tricky words come out right."
    >
      {editing ? (
        <Card>
          <SectionTitle
            icon={BookOpen}
            title={editingId === "new" ? "Add term" : "Edit term"}
          />
          <TextInput
            value={term}
            onChangeText={setTerm}
            maxLength={VOCAB_TERM_MAX}
            placeholder="Term or phrase (e.g. Kubernetes)"
            placeholderTextColor={theme.mutedForeground}
            autoFocus
            style={[
              styles.input,
              {
                color: theme.foreground,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            maxLength={VOCAB_NOTES_MAX}
            placeholder="Notes (optional)"
            placeholderTextColor={theme.mutedForeground}
            multiline
            style={[
              styles.input,
              styles.multiline,
              {
                color: theme.foreground,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
          />
          <View style={styles.formActions}>
            <Pressable
              onPress={cancel}
              style={[styles.btnOutline, { borderColor: theme.border }]}
            >
              <ThemedText style={styles.btnOutlineText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={!term.trim()}
              style={[
                styles.btnPrimary,
                {
                  backgroundColor: theme.primary,
                  opacity: term.trim() ? 1 : 0.5,
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.btnPrimaryText,
                  { color: theme.primaryForeground },
                ]}
              >
                Save
              </ThemedText>
            </Pressable>
          </View>
        </Card>
      ) : (
        <Pressable
          onPress={startAdd}
          style={[styles.addButton, { borderColor: theme.primary }]}
        >
          <Plus color={theme.primary} size={18} />
          <ThemedText style={[styles.addButtonText, { color: theme.primary }]}>
            Add term
          </ThemedText>
        </Pressable>
      )}

      {vocabulary.length === 0 && !editing ? (
        <Card>
          <View style={styles.empty}>
            <BookOpen color={theme.mutedForeground} size={22} />
            <ThemedText themeColor="mutedForeground" style={styles.emptyText}>
              No terms yet. Add names or jargon you dictate often.
            </ThemedText>
          </View>
        </Card>
      ) : null}

      {vocabulary.length > 0 ? (
        <Card style={styles.listCard}>
          {vocabulary.map((entry, i) => (
            <View key={entry.id}>
              {i > 0 ? (
                <View
                  style={[styles.divider, { backgroundColor: theme.border }]}
                />
              ) : null}
              <View style={styles.entryRow}>
                <View style={styles.entryText}>
                  <ThemedText style={styles.entryTerm} numberOfLines={1}>
                    {entry.term}
                  </ThemedText>
                  {entry.notes ? (
                    <ThemedText
                      themeColor="mutedForeground"
                      style={styles.entryNotes}
                      numberOfLines={2}
                    >
                      {entry.notes}
                    </ThemedText>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => startEdit(entry)}
                  hitSlop={8}
                  style={styles.iconBtn}
                >
                  <Pencil color={theme.mutedForeground} size={17} />
                </Pressable>
                <Pressable
                  onPress={() => removeVocab(entry.id)}
                  hitSlop={8}
                  style={styles.iconBtn}
                >
                  <Trash2 color={theme.destructive} size={17} />
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </TabScreenScaffold>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.two,
  },
  btnOutline: {
    height: 40,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  btnPrimary: {
    height: 40,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    height: 48,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  addButtonText: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  empty: {
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 260,
  },
  listCard: { gap: 0 },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -Spacing.three,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.three - 2,
  },
  entryText: { flex: 1 },
  entryTerm: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  entryNotes: { fontSize: 13, marginTop: 2 },
  iconBtn: { padding: 4 },
});
