import { z } from "zod/v3";
import {
  cleanupEmailToneSchema,
  cleanupOverallToneSchema,
  cleanupPersonalToneSchema,
  cleanupWorkToneSchema,
} from "./cleanup-tones.js";

/** One selectable language with its display label. */
export const suggestedLanguageSchema = z.object({
  code: z.string(),
  label: z.string(),
});
export type SuggestedLanguage = z.infer<typeof suggestedLanguageSchema>;

/** Default cleanup tones suggested for an industry (any subset may be present). */
export const industryToneDefaultsSchema = z.object({
  personalTone: cleanupPersonalToneSchema.optional(),
  workTone: cleanupWorkToneSchema.optional(),
  emailTone: cleanupEmailToneSchema.optional(),
  overallTone: cleanupOverallToneSchema.optional(),
});
export type IndustryToneDefaults = z.infer<typeof industryToneDefaultsSchema>;

/**
 * Response shape of the cloud `GET /v2/config` endpoint. `prompts` is the
 * cleanup prompt config (typed on the server side); we keep it `unknown` here
 * so this package does not depend on the server's prompt-config types.
 */
export interface CloudConfigResponse {
  prompts: unknown;
  suggestedLanguages: SuggestedLanguage[];
  industryVocabulary: string[];
  industryToneDefaults: IndustryToneDefaults | null;
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
