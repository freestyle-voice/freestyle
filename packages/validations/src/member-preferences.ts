import { z } from "zod/v3";
import {
  cleanupAppAssignmentsSchema,
  cleanupEmailToneSchema,
  cleanupOverallToneSchema,
  cleanupPersonalToneSchema,
  cleanupWorkToneSchema,
} from "./cleanup-tones.js";
import {
  cleanupCustomPromptSchema,
  cleanupIntensitySchema,
} from "./settings.js";

/**
 * Cloud-synced cleanup preferences for a member (user+org pair). Mirrors the
 * cloud repo's `@freestyle/validations` `memberPreferencesSchema`.
 *
 * This is a PARTIAL patch shape: every field is optional so a client can push
 * only what changed, and `null` explicitly clears a field. Omitting a key
 * leaves the stored value untouched. The nested `vocabulary` object is
 * deep-merged server-side.
 */
export const memberPreferencesSchema = z.object({
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
  language: z.string().max(10).nullish(),
});

export type MemberPreferencesInput = z.infer<typeof memberPreferencesSchema>;

/** Shape returned by the cloud `GET /preferences` (all fields plus syncedAt). */
export type CloudMemberPreferences = MemberPreferencesInput & {
  /** Last cloud-sync time (the cloud row's `updatedAt`), epoch ms or ISO. */
  syncedAt?: number | string | null;
};
