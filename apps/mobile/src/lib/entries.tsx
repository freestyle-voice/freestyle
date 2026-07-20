/**
 * Local vocabulary + dictionary stores for mobile.
 *
 * The Freestyle Cloud has no per-user vocab/dict storage. Both are handled
 * client-side, mirroring the desktop app:
 *   - Vocabulary: `{ term, notes? }` — sent inline on the streaming `start`
 *     message to bias ASR recognition.
 *   - Dictionary: `{ key, value }` — an exact text replacement applied LOCALLY
 *     on the final transcript, after cleanup. Dictionary entries are never sent
 *     to the cloud (same as desktop: the cloud text comes back, then we rewrite).
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getJsonPref, setJsonPref } from "./storage";

export const VOCAB_TERM_MAX = 200;
export const VOCAB_NOTES_MAX = 2000;
export const DICTIONARY_KEY_MAX = 200;
export const DICTIONARY_VALUE_MAX = 5000;

export interface VocabEntry {
  id: string;
  term: string;
  notes?: string;
}

export interface DictionaryEntry {
  id: string;
  key: string;
  value: string;
}

const VOCAB_KEY = "vocabulary";
const DICTIONARY_KEY = "dictionary";

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface EntriesContextValue {
  vocabulary: VocabEntry[];
  dictionary: DictionaryEntry[];
  ready: boolean;
  addVocab: (term: string, notes?: string) => void;
  updateVocab: (id: string, term: string, notes?: string) => void;
  removeVocab: (id: string) => void;
  addDictionary: (key: string, value: string) => void;
  updateDictionary: (id: string, key: string, value: string) => void;
  removeDictionary: (id: string) => void;
}

const EntriesContext = createContext<EntriesContextValue | null>(null);

export function EntriesProvider({ children }: { children: ReactNode }) {
  const [vocabulary, setVocabulary] = useState<VocabEntry[]>([]);
  const [dictionary, setDictionary] = useState<DictionaryEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [vocab, dict] = await Promise.all([
        getJsonPref<VocabEntry[]>(VOCAB_KEY, []),
        getJsonPref<DictionaryEntry[]>(DICTIONARY_KEY, []),
      ]);
      setVocabulary(vocab);
      setDictionary(dict);
      setReady(true);
    })();
  }, []);

  const persistVocab = useCallback((next: VocabEntry[]) => {
    setVocabulary(next);
    void setJsonPref(VOCAB_KEY, next);
  }, []);

  const persistDict = useCallback((next: DictionaryEntry[]) => {
    setDictionary(next);
    void setJsonPref(DICTIONARY_KEY, next);
  }, []);

  const value = useMemo<EntriesContextValue>(
    () => ({
      vocabulary,
      dictionary,
      ready,
      addVocab: (term, notes) => {
        const trimmed = term.trim();
        if (!trimmed) return;
        persistVocab([
          { id: newId(), term: trimmed, notes: notes?.trim() || undefined },
          ...vocabulary,
        ]);
      },
      updateVocab: (id, term, notes) => {
        const trimmed = term.trim();
        if (!trimmed) return;
        persistVocab(
          vocabulary.map((e) =>
            e.id === id
              ? { ...e, term: trimmed, notes: notes?.trim() || undefined }
              : e,
          ),
        );
      },
      removeVocab: (id) => persistVocab(vocabulary.filter((e) => e.id !== id)),
      addDictionary: (key, val) => {
        const k = key.trim();
        const v = val.trim();
        if (!k || !v) return;
        persistDict([{ id: newId(), key: k, value: v }, ...dictionary]);
      },
      updateDictionary: (id, key, val) => {
        const k = key.trim();
        const v = val.trim();
        if (!k || !v) return;
        persistDict(
          dictionary.map((e) => (e.id === id ? { ...e, key: k, value: v } : e)),
        );
      },
      removeDictionary: (id) =>
        persistDict(dictionary.filter((e) => e.id !== id)),
    }),
    [vocabulary, dictionary, ready, persistVocab, persistDict],
  );

  return (
    <EntriesContext.Provider value={value}>{children}</EntriesContext.Provider>
  );
}

/** Access vocabulary + dictionary entries. Must be under an `EntriesProvider`. */
export function useEntries(): EntriesContextValue {
  const ctx = useContext(EntriesContext);
  if (!ctx) {
    throw new Error("useEntries must be used within an EntriesProvider");
  }
  return ctx;
}

/** The vocabulary terms as a plain string list for the cloud `start` message. */
export function vocabularyTerms(entries: VocabEntry[]): string[] {
  return entries.map((e) => e.term).filter(Boolean);
}

// --- Dictionary replacement (client-side, mirrors the desktop algorithm) ---

const CJK_SCRIPT_RE =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

/**
 * A "word-like" character: letter, number, or underscore. We avoid Unicode
 * property escapes (`\p{L}`) and lookbehind because Hermes (RN's engine) has
 * historically shaky support for them — a manual boundary check is safe on any
 * engine and matches the desktop's word-like class closely enough.
 */
function isWordLike(ch: string): boolean {
  return /[\p{L}\p{N}_]/u.test(ch);
}

function escapeRegex(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const regexCache = new Map<string, RegExp>();

function buildDictionaryRegex(key: string): RegExp {
  const cached = regexCache.get(key);
  if (cached) return cached;
  // CJK is written without spaces, so boundaries would block valid matches.
  const flags = CJK_SCRIPT_RE.test(key) ? "gu" : "giu";
  const regex = new RegExp(escapeRegex(key), flags);
  regexCache.set(key, regex);
  return regex;
}

/**
 * Apply the user's dictionary to a final transcript. Longest keys first (so a
 * short key can't clobber an overlapping longer one). Non-CJK matches respect
 * word boundaries — a match only counts when the characters immediately
 * surrounding it are not word-like (only enforced on the key's word-like edges,
 * matching the desktop). The replacement value is inserted verbatim.
 */
export function applyDictionaryReplacements(
  text: string,
  entries: DictionaryEntry[],
): string {
  if (!text.trim() || entries.length === 0) return text;

  const ordered = [...entries].sort((a, b) => b.key.length - a.key.length);
  let out = text;

  for (const { key, value } of ordered) {
    if (!key) continue;
    const isCjk = CJK_SCRIPT_RE.test(key);
    const startsWordLike = isWordLike(key[0]);
    const endsWordLike = isWordLike(key[key.length - 1]);
    const regex = buildDictionaryRegex(key);

    out = out.replace(regex, (match, offset: number, full: string) => {
      if (!isCjk) {
        // Enforce a boundary only on edges where the key is word-like.
        if (startsWordLike && offset > 0 && isWordLike(full[offset - 1])) {
          return match;
        }
        const after = offset + match.length;
        if (endsWordLike && after < full.length && isWordLike(full[after])) {
          return match;
        }
      }
      return value;
    });
  }

  return out;
}
