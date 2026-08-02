import { z } from "zod/v3";

/** Max number of transcription languages a user can select (cloud parity). */
export const MAX_LANGUAGES = 5;

/**
 * The canonical transcription-language list: an array of ISO codes.
 *
 * Mirrors the cloud repo's `memberPreferences.languages` contract — an array so
 * a multilingual user can list every language they speak (streaming STT biases
 * toward all of them; batch STT uses the first). Capped at {@link MAX_LANGUAGES}
 * to keep the STT hints focused. `[]` (or `null`) means auto-detect.
 *
 * Note the sentinel `"auto"` is a UI-only concept and is never stored here:
 * pickers translate an "auto-detect" selection into an empty array.
 */
export const languageListSchema = z
  .array(z.string().trim().min(1).max(10))
  .max(MAX_LANGUAGES);
export type LanguageList = z.infer<typeof languageListSchema>;

/**
 * Normalize a raw language-code list into the canonical stored form: trim,
 * lowercase, drop empties and the `"auto"` sentinel, dedupe (order-preserving),
 * and cap at {@link MAX_LANGUAGES}. Returns `[]` when nothing usable remains
 * (which the cloud and providers treat as auto-detect).
 */
export function normalizeLanguageList(
  codes: readonly string[] | null | undefined,
): string[] {
  if (!codes) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of codes) {
    const code = raw.trim().toLowerCase();
    if (!code || code === "auto" || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= MAX_LANGUAGES) break;
  }
  return out;
}

/**
 * Resolve a persisted language selection into the canonical list, shared by
 * every client's storage layer (server SQLite, Electron settings map, mobile
 * AsyncStorage). `raw` is the stored value of the canonical `languages` key (a
 * JSON array string); `legacy` is the pre-migration singular `language` value.
 *
 * Semantics (matching the server's authoritative read):
 *   - `raw` present (even empty/invalid) is authoritative → never falls back;
 *     an explicit empty/cleared value means auto-detect (`[]`). A stray scalar
 *     stored under the array key is tolerated as a single code.
 *   - only an entirely absent `raw` falls back to the legacy singular key, so a
 *     pre-migration choice is honored exactly once.
 */
export function parseStoredLanguageList(
  raw: string | null | undefined,
  legacy: string | null | undefined,
): string[] {
  if (raw != null) {
    if (!raw) return []; // present-but-empty = explicit auto-detect
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizeLanguageList(parsed);
    } catch {
      // A stray scalar stored under the array key — treat as one code.
      return normalizeLanguageList([raw]);
    }
    return [];
  }
  return normalizeLanguageList(legacy ? [legacy] : []);
}

/** One selectable language with its display label. */
export const suggestedLanguageSchema = z.object({
  code: z.string(),
  label: z.string(),
});
export type SuggestedLanguage = z.infer<typeof suggestedLanguageSchema>;

/**
 * Response shape of the cloud `GET /v2/config` endpoint. `prompts` is the
 * cleanup prompt config (typed on the server side); we keep it `unknown` here
 * so this package does not depend on the server's prompt-config types.
 *
 * Industry defaults are now applied server-side at profile-update time and are
 * no longer returned by this endpoint.
 */
export interface CloudConfigResponse {
  prompts: unknown;
  suggestedLanguages: SuggestedLanguage[];
}

/**
 * Order a list of language options so the cloud-suggested languages (for the
 * user's region) come first, preserving each group's relative order.
 *
 * Shared by the desktop and mobile language pickers so the ranking behavior
 * stays identical. Callers pass a `getCode` accessor because the two apps model
 * an option differently (`{ value }` on desktop, `{ code }` on mobile).
 *
 * - `pinnedFirst` codes (e.g. `"auto"`) are always kept at the front, in the
 *   order they appear in `options`.
 * - Remaining options are sorted by their index in `suggested`; options not in
 *   `suggested` keep their original relative order (stable) after the suggested
 *   ones.
 * - Returns the input unchanged when there are no suggestions.
 */
export function orderBySuggestedLanguages<T>(
  options: readonly T[],
  suggested: readonly SuggestedLanguage[] | undefined,
  getCode: (option: T) => string,
  pinnedFirst: readonly string[] = ["auto"],
): T[] {
  if (!suggested?.length) return [...options];

  const rank = new Map<string, number>();
  suggested.forEach((l, i) => {
    if (!rank.has(l.code)) rank.set(l.code, i);
  });

  const pinnedSet = new Set(pinnedFirst);
  const pinned = options.filter((o) => pinnedSet.has(getCode(o)));
  const rest = options.filter((o) => !pinnedSet.has(getCode(o)));

  const ordered = rest
    .map((o, i) => ({ o, i }))
    .sort((a, b) => {
      const ra = rank.get(getCode(a.o));
      const rb = rank.get(getCode(b.o));
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return a.i - b.i; // stable: preserve original order for non-suggested
    })
    .map((x) => x.o);

  return [...pinned, ...ordered];
}

/** A language option in the shape both pickers consume. */
export interface LanguageChoice {
  code: string;
  label: string;
}

/**
 * Resolve the full, ordered list of transcription-language options for a picker.
 *
 * The cloud `GET /v2/config` `suggestedLanguages` already returns the complete
 * Soniox-supported set (~66 languages) pre-sorted for the user's region
 * (English → region priorities → the rest alphabetically). When that list is
 * present it is the source of truth, so the picker offers every language the
 * engine supports. When it is unavailable (offline / signed out), we fall back
 * to the small curated local list so the picker still works.
 *
 * `"auto"` (or any `pinnedFirst` code) is always surfaced first, taking its
 * label from the local list since the cloud set only contains real languages.
 *
 * @param suggested full/ordered language set from the cloud, or `undefined`
 * @param localFallback curated `{ code, label }` list bundled with the app
 * @param pinnedFirst codes always kept at the front (default `["auto"]`)
 */
export function resolveLanguageOptions(
  suggested: readonly SuggestedLanguage[] | undefined,
  localFallback: readonly LanguageChoice[],
  pinnedFirst: readonly string[] = ["auto"],
): LanguageChoice[] {
  const pinnedSet = new Set(pinnedFirst);

  // Offline / signed out: just order the local list by whatever we have.
  if (!suggested?.length) {
    return orderBySuggestedLanguages(
      localFallback,
      suggested,
      (l) => l.code,
      pinnedFirst,
    ).map((l) => ({ code: l.code, label: l.label }));
  }

  // Pinned entries come from the local list (the cloud set has no "auto").
  const pinned = localFallback.filter((l) => pinnedSet.has(l.code));
  const seen = new Set(pinned.map((l) => l.code));

  const rest: LanguageChoice[] = [];
  for (const lang of suggested) {
    if (pinnedSet.has(lang.code) || seen.has(lang.code)) continue;
    seen.add(lang.code);
    rest.push({ code: lang.code, label: lang.label });
  }

  return [...pinned, ...rest];
}

/**
 * Filter language options by a free-text query, matching either the display
 * label or the language code (case-insensitive). Pinned entries such as
 * `"auto"` are always kept so the search list never hides the default. An empty
 * query returns the list unchanged.
 */
export function filterLanguageOptions<T extends LanguageChoice>(
  options: readonly T[],
  query: string,
  pinnedFirst: readonly string[] = ["auto"],
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  const pinnedSet = new Set(pinnedFirst);
  return options.filter(
    (o) =>
      pinnedSet.has(o.code) ||
      o.label.toLowerCase().includes(q) ||
      o.code.toLowerCase().includes(q),
  );
}
