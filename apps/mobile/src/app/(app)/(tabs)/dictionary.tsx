import { ArrowRight, Pencil, Plus, Replace, Trash2 } from "lucide-react-native";
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
  DICTIONARY_KEY_MAX,
  DICTIONARY_VALUE_MAX,
  type DictionaryEntry,
  useEntries,
} from "@/lib/entries";

export default function DictionaryScreen() {
  const theme = useTheme();
  const { dictionary, addDictionary, updateDictionary, removeDictionary } =
    useEntries();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const editing = editingId !== null;

  const startAdd = () => {
    setKey("");
    setValue("");
    setEditingId("new");
  };

  const startEdit = (entry: DictionaryEntry) => {
    setEditingId(entry.id);
    setKey(entry.key);
    setValue(entry.value);
  };

  const cancel = () => {
    setEditingId(null);
    setKey("");
    setValue("");
  };

  const save = () => {
    if (!key.trim() || !value.trim()) return;
    if (editingId && editingId !== "new") {
      updateDictionary(editingId, key, value);
    } else {
      addDictionary(key, value);
    }
    cancel();
  };

  const canSave = key.trim().length > 0 && value.trim().length > 0;

  return (
    <TabScreenScaffold
      title="Dictionary"
      subtitle="Automatic text replacements applied on your device after cleanup. Great for expanding shorthand or fixing how a word is spelled."
    >
      {editing ? (
        <Card>
          <SectionTitle
            icon={Replace}
            title={editingId === "new" ? "Add replacement" : "Edit replacement"}
          />
          <TextInput
            value={key}
            onChangeText={setKey}
            maxLength={DICTIONARY_KEY_MAX}
            placeholder="When I say… (e.g. brb)"
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
            value={value}
            onChangeText={setValue}
            maxLength={DICTIONARY_VALUE_MAX}
            placeholder="Replace with… (e.g. be right back)"
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
              disabled={!canSave}
              style={[
                styles.btnPrimary,
                { backgroundColor: theme.primary, opacity: canSave ? 1 : 0.5 },
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
            Add replacement
          </ThemedText>
        </Pressable>
      )}

      {dictionary.length === 0 && !editing ? (
        <Card>
          <View style={styles.empty}>
            <Replace color={theme.mutedForeground} size={22} />
            <ThemedText themeColor="mutedForeground" style={styles.emptyText}>
              No replacements yet. Add shorthand or fixes you use often.
            </ThemedText>
          </View>
        </Card>
      ) : null}

      {dictionary.length > 0 ? (
        <Card style={styles.listCard}>
          {dictionary.map((entry, i) => (
            <View key={entry.id}>
              {i > 0 ? (
                <View
                  style={[styles.divider, { backgroundColor: theme.border }]}
                />
              ) : null}
              <View style={styles.entryRow}>
                <View style={styles.entryText}>
                  <View style={styles.replaceLine}>
                    <ThemedText style={styles.entryKey} numberOfLines={1}>
                      {entry.key}
                    </ThemedText>
                    <ArrowRight color={theme.mutedForeground} size={14} />
                    <ThemedText
                      themeColor="mutedForeground"
                      style={styles.entryValue}
                      numberOfLines={1}
                    >
                      {entry.value}
                    </ThemedText>
                  </View>
                </View>
                <Pressable
                  onPress={() => startEdit(entry)}
                  hitSlop={8}
                  style={styles.iconBtn}
                >
                  <Pencil color={theme.mutedForeground} size={17} />
                </Pressable>
                <Pressable
                  onPress={() => removeDictionary(entry.id)}
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
  multiline: { minHeight: 60, textAlignVertical: "top" },
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
  replaceLine: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  entryKey: { fontFamily: Fonts.sansMedium, fontSize: 15, flexShrink: 1 },
  entryValue: { fontSize: 14, flexShrink: 1 },
  iconBtn: { padding: 4 },
});
