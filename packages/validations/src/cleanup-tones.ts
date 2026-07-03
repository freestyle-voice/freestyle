import { z } from "zod/v3";

export const cleanupPersonalToneSchema = z.enum([
  "polished",
  "casual",
  "very_casual",
]);

export const cleanupWorkToneSchema = z.enum(["direct", "friendly", "formal"]);

export const cleanupEmailToneSchema = z.enum(["casual", "warm", "formal"]);

// "Everything else" — the tone applied to destinations we don't recognize as
// personal, work, or email. A plain formality dial rather than a surface-shaped
// tone, since the destination is unknown.
export const cleanupOverallToneSchema = z.enum([
  "casual",
  "neutral",
  "professional",
]);

export type CleanupPersonalTone = z.infer<typeof cleanupPersonalToneSchema>;
export type CleanupWorkTone = z.infer<typeof cleanupWorkToneSchema>;
export type CleanupEmailTone = z.infer<typeof cleanupEmailToneSchema>;
export type CleanupOverallTone = z.infer<typeof cleanupOverallToneSchema>;

export const cleanupToneDestinationSchema = z.enum([
  "overall",
  "personal",
  "work",
  "email",
]);

export type CleanupToneDestination = z.infer<
  typeof cleanupToneDestinationSchema
>;

export const DEFAULT_CLEANUP_PERSONAL_TONE: CleanupPersonalTone = "casual";
export const DEFAULT_CLEANUP_WORK_TONE: CleanupWorkTone = "friendly";
export const DEFAULT_CLEANUP_EMAIL_TONE: CleanupEmailTone = "warm";
export const DEFAULT_CLEANUP_OVERALL_TONE: CleanupOverallTone = "neutral";

export function parseCleanupPersonalTone(
  value: string | null | undefined,
): CleanupPersonalTone {
  const result = cleanupPersonalToneSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_CLEANUP_PERSONAL_TONE;
}

export function parseCleanupWorkTone(
  value: string | null | undefined,
): CleanupWorkTone {
  const result = cleanupWorkToneSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_CLEANUP_WORK_TONE;
}

export function parseCleanupEmailTone(
  value: string | null | undefined,
): CleanupEmailTone {
  const result = cleanupEmailToneSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_CLEANUP_EMAIL_TONE;
}

export function parseCleanupOverallTone(
  value: string | null | undefined,
): CleanupOverallTone {
  const result = cleanupOverallToneSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_CLEANUP_OVERALL_TONE;
}

// ---------------------------------------------------------------------------
// App assignments — user overrides that route a specific app or website into a
// tone group. Consulted before the built-in match lists, so a user can pull
// Discord into "work", push a niche mail client into "email", etc. `match` is a
// lowercased token compared against the captured app name (kind "app") or the
// URL/window text (kind "site").
// ---------------------------------------------------------------------------

export const cleanupAppAssignmentSchema = z.object({
  match: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120),
  kind: z.enum(["app", "site"]),
  destination: cleanupToneDestinationSchema,
});

export const cleanupAppAssignmentsSchema = z
  .array(cleanupAppAssignmentSchema)
  .max(200);

export type CleanupAppAssignment = z.infer<typeof cleanupAppAssignmentSchema>;

export function parseCleanupAppAssignments(
  value: string | null | undefined,
): CleanupAppAssignment[] {
  if (!value) return [];
  try {
    const result = cleanupAppAssignmentsSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}
