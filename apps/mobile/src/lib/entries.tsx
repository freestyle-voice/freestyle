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

import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/hooks/use-auth";
import { getActiveOrganization } from "./cloud/org";
import {
  fetchCloudVocabularyTerms,
  pushCloudVocabularyTerms,
} from "./cloud/preferences";
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
  /** Remove several vocabulary entries at once (multi-select delete). */
  removeVocabMany: (ids: string[]) => void;
  addDictionary: (key: string, value: string) => void;
  updateDictionary: (id: string, key: string, value: string) => void;
  removeDictionary: (id: string) => void;
}

const EntriesContext = createContext<EntriesContextValue | null>(null);

/**
 * Debounce window for pushing the local vocabulary up to the cloud. A burst of
 * edits (or a multi-delete) coalesces into one PUT carrying the latest list.
 */
const VOCAB_PUSH_DEBOUNCE_MS = 600;

export function EntriesProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useAuth();
  // The active org id. Vocabulary is per-org (stored under the org's
  // `member_preferences`), so switching orgs must re-pull it. This shares the
  // profile screen's query key, which the switcher invalidates — the id then
  // re-resolves here and drives the pull effect below.
  const { data: activeOrg } = useQuery({
    queryKey: ["cloud-active-org"],
    queryFn: getActiveOrganization,
    enabled: signedIn,
  });
  const activeOrgId = activeOrg?.id;
  const [vocabulary, setVocabulary] = useState<VocabEntry[]>([]);
  const [dictionary, setDictionary] = useState<DictionaryEntry[]>([]);
  const [ready, setReady] = useState(false);

  // Latest vocabulary, read at flush time so the debounced push always sends the
  // newest snapshot (mirrors the desktop's read-at-flush push).
  const vocabRef = useRef<VocabEntry[]>([]);
  vocabRef.current = vocabulary;
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read at flush time so the unmount flush (which fires after sign-out tears
  // the tree down) doesn't push under a session that no longer exists.
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

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

  const flushVocabPush = useCallback(() => {
    if (!signedInRef.current) return;
    // Send the full local list — the cloud replaces its `terms` wholesale, so
    // this propagates both adds and deletes. Errors are swallowed (offline /
    // signed out) so a sync failure never disrupts the local write.
    void pushCloudVocabularyTerms(vocabularyTerms(vocabRef.current)).catch(
      () => {},
    );
  }, []);

  const schedulePush = useCallback(() => {
    if (!signedIn) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(flushVocabPush, VOCAB_PUSH_DEBOUNCE_MS);
  }, [signedIn, flushVocabPush]);

  const persistVocab = useCallback(
    (next: VocabEntry[], opts?: { sync?: boolean }) => {
      setVocabulary(next);
      vocabRef.current = next;
      void setJsonPref(VOCAB_KEY, next);
      // `sync` is true for local user edits (push up), false for a cloud mirror
      // (the value already came FROM the cloud — pushing it back would echo).
      if (opts?.sync !== false) schedulePush();
    },
    [schedulePush],
  );

  const persistDict = useCallback((next: DictionaryEntry[]) => {
    setDictionary(next);
    void setJsonPref(DICTIONARY_KEY, next);
  }, []);

  // Pull the cloud's canonical vocabulary and mirror it locally on mount, when
  // the user signs in, and when the active org changes (vocabulary is per-org).
  // Only runs once local state has loaded so the mirror diffs against the real
  // list (not the empty initial state). A cloud snapshot with no `vocabulary`
  // object (undefined) leaves local untouched.
  //
  // `activeOrgId` is an intentional dependency: the body never reads it, but a
  // change means the active org switched, so the per-org vocabulary must be
  // re-pulled and re-mirrored.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeOrgId is a deliberate re-pull trigger
  useEffect(() => {
    if (!ready || !signedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const cloudTerms = await fetchCloudVocabularyTerms();
        if (cancelled) return;
        if (cloudTerms === undefined) {
          // Cloud carries no vocabulary yet. Seed it from the local terms so ASR
          // biasing keeps working now that the app no longer sends vocabulary
          // inline on `start`. Idempotent: once the cloud has terms this branch
          // stops firing; a failed push retries on the next sign-in / mount.
          const localTerms = vocabularyTerms(vocabRef.current);
          if (localTerms.length > 0) {
            void pushCloudVocabularyTerms(localTerms).catch(() => {});
          }
          return;
        }
        const mirrored = mirrorCloudTerms(vocabRef.current, cloudTerms);
        // Reference-equal when nothing changed — skip the redundant write.
        if (mirrored !== vocabRef.current) {
          persistVocab(mirrored, { sync: false });
        }
      } catch {
        // Offline / no org / transient — keep local terms and move on.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, signedIn, activeOrgId, persistVocab]);

  // Flush any pending push on unmount so a debounced edit isn't lost.
  useEffect(() => {
    return () => {
      if (pushTimer.current) {
        clearTimeout(pushTimer.current);
        flushVocabPush();
      }
    };
  }, [flushVocabPush]);

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
      removeVocabMany: (ids) => {
        const drop = new Set(ids);
        if (drop.size === 0) return;
        persistVocab(vocabulary.filter((e) => !drop.has(e.id)));
      },
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

/**
 * Mirror the cloud's canonical term set onto the local vocabulary list.
 *
 * The cloud is authoritative for vocabulary (it stores only `{ terms }`, no
 * per-term notes), so on pull we make the local list an exact mirror:
 *   - **insert** cloud terms missing locally (case-insensitive), notes left
 *     empty since the cloud carries none,
 *   - **delete** local terms the cloud no longer has,
 *   - **preserve** local-only `notes` on surviving terms (matched
 *     case-insensitively) — notes are a local enrichment a pull must not clobber.
 *
 * Returns the same array reference when nothing changed, so callers can skip a
 * needless AsyncStorage write / re-render. Order follows the cloud list, with
 * surviving local entries keeping their identity (id + notes).
 */
export function mirrorCloudTerms(
  local: VocabEntry[],
  cloudTerms: string[],
): VocabEntry[] {
  // Canonical cloud set, deduped case-insensitively (matches the cloud + desktop).
  const cloudByKey = new Map<string, string>();
  for (const raw of cloudTerms) {
    const term = raw.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (!cloudByKey.has(key)) cloudByKey.set(key, term);
  }

  const localByKey = new Map<string, VocabEntry>();
  for (const entry of local) {
    const key = entry.term.trim().toLowerCase();
    if (key && !localByKey.has(key)) localByKey.set(key, entry);
  }

  const next: VocabEntry[] = [];
  for (const [key, term] of cloudByKey) {
    const existing = localByKey.get(key);
    // Keep the local row (id + notes) when the term already exists locally;
    // otherwise insert a fresh row for the cloud term.
    next.push(existing ?? { id: newId(), term });
  }

  // No change when the local list already equals the mirror (same ids, order,
  // and notes) — avoids a redundant persist + re-render on every pull.
  const unchanged =
    next.length === local.length &&
    next.every((e, i) => {
      const l = local[i];
      return l && l.id === e.id && l.term === e.term && l.notes === e.notes;
    });

  return unchanged ? local : next;
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
