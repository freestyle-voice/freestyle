import { BookOpen, Check, Pencil, Plus, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
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
  const { vocabulary, addVocab, updateVocab, removeVocab, removeVocabMany } =
    useEntries();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [notes, setNotes] = useState("");

  // Multi-select state. `selecting` toggles the mode; `selected` holds the
  // chosen entry ids. Editing and selecting are mutually exclusive.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  // Never leave the UI stranded in select mode with nothing to act on. If the
  // list empties (last delete, or a background cloud mirror), drop out of select
  // mode; otherwise prune selected ids that no longer exist so the count stays
  // truthful. Runs only when the set of entry ids actually changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on entry ids
  useEffect(() => {
    if (!selecting) return;
    if (vocabulary.length === 0) {
      exitSelect();
      return;
    }
    setSelected((prev) => {
      const live = new Set(vocabulary.map((e) => e.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [vocabulary, selecting]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = () => {
    if (selected.size === 0) return;
    removeVocabMany([...selected]);
    exitSelect();
  };

  // The header action toggles select mode. Hidden while editing or when the
  // list is empty (nothing to select).
  const headerAction =
    !editing && vocabulary.length > 0 ? (
      <Pressable
        onPress={selecting ? exitSelect : () => setSelecting(true)}
        hitSlop={8}
        style={styles.headerBtn}
      >
        <ThemedText style={[styles.headerBtnText, { color: theme.primary }]}>
          {selecting ? "Cancel" : "Select"}
        </ThemedText>
      </Pressable>
    ) : undefined;

  return (
    <TabScreenScaffold
      title="Vocabulary"
      subtitle="Names, jargon, and phrases Freestyle should recognize. These bias speech recognition so tricky words come out right."
      action={headerAction}
    >
      {selecting ? (
        <View
          style={[
            styles.selectBar,
            { borderColor: theme.border, backgroundColor: theme.card },
          ]}
        >
          <ThemedText style={styles.selectCount}>
            {selected.size} selected
          </ThemedText>
          <Pressable
            onPress={deleteSelected}
            disabled={selected.size === 0}
            style={[
              styles.deleteSelectedBtn,
              {
                borderColor: theme.destructive,
                opacity: selected.size === 0 ? 0.4 : 1,
              },
            ]}
          >
            <Trash2 color={theme.destructive} size={16} />
            <ThemedText
              style={[styles.deleteSelectedText, { color: theme.destructive }]}
            >
              Delete
            </ThemedText>
          </Pressable>
        </View>
      ) : editing ? (
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
          {vocabulary.map((entry, i) => {
            const isSelected = selected.has(entry.id);
            return (
              <View key={entry.id}>
                {i > 0 ? (
                  <View
                    style={[styles.divider, { backgroundColor: theme.border }]}
                  />
                ) : null}
                <Pressable
                  onPress={
                    selecting ? () => toggleSelected(entry.id) : undefined
                  }
                  style={styles.entryRow}
                >
                  {selecting ? (
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: isSelected
                            ? theme.primary
                            : theme.border,
                          backgroundColor: isSelected
                            ? theme.primary
                            : "transparent",
                        },
                      ]}
                    >
                      {isSelected ? (
                        <Check color={theme.primaryForeground} size={13} />
                      ) : null}
                    </View>
                  ) : null}
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
                  {selecting ? null : (
                    <>
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
                    </>
                  )}
                </Pressable>
              </View>
            );
          })}
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
  headerBtn: { paddingHorizontal: Spacing.two, paddingVertical: 4 },
  headerBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: Radius.xl,
    paddingLeft: Spacing.four,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.two,
  },
  selectCount: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  deleteSelectedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two - 2,
    height: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  deleteSelectedText: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
