import { z } from "zod/v3";
import {
  cleanupAppAssignmentsSchema,
  cleanupEmailToneSchema,
  cleanupOverallToneSchema,
  cleanupPersonalToneSchema,
  cleanupWorkToneSchema,
} from "./cleanup-tones.js";
import { languageListSchema } from "./cloud-config.js";
import { industrySchema } from "./profile.js";
import {
  cleanupCustomPromptSchema,
  cleanupIntensitySchema,
} from "./settings.js";

/**
 * Cloud-synced member preferences (user+org pair). Mirrors the cloud repo's
 * `@freestyle/validations` `memberPreferencesSchema`.
 *
 * This is a PARTIAL patch shape: every field is optional so a client can push
 * only what changed, and `null` explicitly clears a field. Omitting a key
 * leaves the stored value untouched. The nested `vocabulary` object is
 * deep-merged server-side.
 *
 * Owns the full `member_preferences` row, including profile context
 * (`industry`/`company`/`jobTitle`). Setting or changing `industry` re-seeds
 * tone + vocabulary defaults unless `updatePreferences` is `false`.
 */
export const memberPreferencesSchema = z.object({
  industry: industrySchema.nullish(),
  company: z.string().trim().max(120).nullish(),
  jobTitle: z.string().trim().max(120).nullish(),
  // Transient control flag (NOT persisted): when the industry changes and this
  // is not explicitly `false`, the server re-seeds tone + vocabulary defaults.
  updatePreferences: z.boolean().optional(),
  intensity: cleanupIntensitySchema.nullish(),
  customPrompt: cleanupCustomPromptSchema.nullish(),
  personalTone: cleanupPersonalToneSchema.nullish(),
  workTone: cleanupWorkToneSchema.nullish(),
  emailTone: cleanupEmailToneSchema.nullish(),
  overallTone: cleanupOverallToneSchema.nullish(),
  appAssignments: cleanupAppAssignmentsSchema.nullish(),
  vocabulary: z
    .object({
      terms: z.array(z.string().trim().min(1).max(200)).max(1000).optional(),
      text: z.string().trim().max(2000).optional(),
    })
    .nullish(),
  // Preferred spoken languages (ISO codes). An array so a multilingual user can
  // list every language they speak; `[]`/`null` clears the field (auto-detect).
  // Replace-semantics on the cloud (not merged).
  languages: languageListSchema.nullish(),
});

export type MemberPreferencesInput = z.infer<typeof memberPreferencesSchema>;

/** Shape returned by the cloud `GET /preferences` (all fields plus syncedAt). */
export type CloudMemberPreferences = MemberPreferencesInput & {
  /** Last cloud-sync time (the cloud row's `updatedAt`), epoch ms or ISO. */
  syncedAt?: number | string | null;
};
