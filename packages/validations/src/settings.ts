import { z } from "zod/v3";

export const settingValueSchema = z.object({
  value: z.string(),
});

export type SettingValueInput = z.infer<typeof settingValueSchema>;

/** Post-processing (AI cleanup) intensity levels. */
export const cleanupIntensitySchema = z.enum([
  "low",
  "medium",
  "high",
  "custom",
]);

export type CleanupIntensity = z.infer<typeof cleanupIntensitySchema>;

export const DEFAULT_CLEANUP_INTENSITY: CleanupIntensity = "low";

/**
 * Upper bound on a user-authored custom cleanup prompt. Comfortably above the
 * longest built-in preset (~8k chars) so users can seed Custom from any preset
 * and still have room to build on top of it.
 */
export const CLEANUP_CUSTOM_PROMPT_MAX = 20000;

export const cleanupCustomPromptSchema = z
  .string()
  .max(CLEANUP_CUSTOM_PROMPT_MAX);

/**
 * Coerce an arbitrary persisted value into a valid {@link CleanupIntensity},
 * falling back to the default when missing or malformed.
 */
export function parseCleanupIntensity(
  value: string | null | undefined,
): CleanupIntensity {
  const result = cleanupIntensitySchema.safeParse(value);
  return result.success ? result.data : DEFAULT_CLEANUP_INTENSITY;
}
