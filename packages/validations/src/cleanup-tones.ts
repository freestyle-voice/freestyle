import { z } from "zod/v3";

// "off" is a valid value for every sector tone. It means the user has turned
// styling off for that destination: cleanup still runs the base preset, but no
// destination tone or structure block is applied (see destination-style.ts).
export const cleanupPersonalToneSchema = z.enum([
  "polished",
  "casual",
  "very_casual",
  "off",
]);

export const cleanupWorkToneSchema = z.enum([
  "direct",
  "friendly",
  "formal",
  "off",
]);

export const cleanupEmailToneSchema = z.enum([
  "casual",
  "warm",
  "formal",
  "off",
]);

// "Everything else" — the tone applied to destinations we don't recognize as
// personal, work, or email. A plain formality dial rather than a surface-shaped
// tone, since the destination is unknown.
export const cleanupOverallToneSchema = z.enum([
  "casual",
  "neutral",
  "professional",
  "off",
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

export const DEFAULT_CLEANUP_PERSONAL_TONE: CleanupPersonalTone = "off";
export const DEFAULT_CLEANUP_WORK_TONE: CleanupWorkTone = "off";
export const DEFAULT_CLEANUP_EMAIL_TONE: CleanupEmailTone = "off";
export const DEFAULT_CLEANUP_OVERALL_TONE: CleanupOverallTone = "off";

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

/** True when every sector tone is off — no destination routing is needed. */
export function areAllCleanupTonesOff(tones: {
  personalTone: CleanupPersonalTone;
  workTone: CleanupWorkTone;
  emailTone: CleanupEmailTone;
  overallTone: CleanupOverallTone;
}): boolean {
  return (
    tones.personalTone === "off" &&
    tones.workTone === "off" &&
    tones.emailTone === "off" &&
    tones.overallTone === "off"
  );
}

// ---------------------------------------------------------------------------
// App assignments — user overrides that route a specific app or website into a
// tone group. Consulted before the built-in match lists, so a user can pull
// Discord into "work", push a niche mail client into "email", etc. `match` is a
// lowercased token compared against the captured app name (kind "app") or the
// URL/window text (kind "site").
// ---------------------------------------------------------------------------

export const cleanupAppAssignmentSchema = z.object({
  // Lowercased here so the desktop client and the server enforce the same
  // invariant the runtime matcher relies on: rewrite-context lowercases both the
  // captured app name and the window/URL text before comparing against `match`.
  match: z.string().trim().toLowerCase().min(1).max(120),
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

/** App and site patterns used to choose a cleanup-tone destination. */
export interface CleanupRoutingConfig {
  emailAppNames: readonly string[];
  workAppNames: readonly string[];
  personalAppNames: readonly string[];
  emailPatterns: readonly string[];
  workPatterns: readonly string[];
  personalPatterns: readonly string[];
  discordPatterns: readonly string[];
}

/** Bundled routing fallback. Cloud may supply a newer config at runtime. */
export const DEFAULT_CLEANUP_ROUTING: CleanupRoutingConfig = {
  emailAppNames: [
    "mail", "outlook", "microsoft outlook", "mimestream", "superhuman", "spark", "spark desktop",
    "canary mail", "thunderbird", "airmail", "em client", "postbox", "hey",
  ],
  workAppNames: ["slack", "linkedin", "teams", "microsoft teams"],
  personalAppNames: ["messages", "imessage", "whatsapp", "telegram", "discord"],
  emailPatterns: [
    "mail.google.com", "workspace.google.com/mail", "gmail", "outlook.office.com", "outlook.live.com",
    "outlook.office365.com", "outlook.office", "outlook", "mail.yahoo.com", "mail.yahoo", "yahoo mail",
    "mail.proton.me", "proton.me/mail", "protonmail.com", "proton mail", "superhuman", "spark mail",
    "mimestream", "app.fastmail.com", "fastmail", "hey.com", "hey email", "icloud.com/mail", "mail.app",
    "apple mail", "canary mail",
  ],
  workPatterns: ["slack.com", "slack", "linkedin.com", "linkedin", "teams.microsoft.com", "microsoft teams", "teams"],
  personalPatterns: ["messages", "imessage", "whatsapp", "telegram", "discord.com", "discord"],
  discordPatterns: ["discord.com", "discord"],
};

export interface CleanupToneRoutingContext {
  appName?: string | null;
  title?: string | null;
  windowTitle?: string | null;
  url?: string | null;
}

/** Resolve user overrides first, followed by the configured built-in rules. */
export function resolveCleanupToneDestination(
  context: CleanupToneRoutingContext,
  assignments: readonly CleanupAppAssignment[] = [],
  routing: CleanupRoutingConfig = DEFAULT_CLEANUP_ROUTING,
): CleanupToneDestination {
  const appName = context.appName?.trim().toLowerCase() ?? "";
  const matchText = [context.url, context.title, context.windowTitle, context.appName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .toLowerCase();

  for (let index = assignments.length - 1; index >= 0; index -= 1) {
    const assignment = assignments[index]!;
    if (assignment.kind === "app" && appName === assignment.match) return assignment.destination;
  }
  for (let index = assignments.length - 1; index >= 0; index -= 1) {
    const assignment = assignments[index]!;
    if (assignment.kind === "site" && matchText.includes(assignment.match)) return assignment.destination;
  }

  if (routing.emailAppNames.includes(appName) || routing.emailPatterns.some((pattern) => matchText.includes(pattern))) return "email";
  if (routing.workAppNames.includes(appName) || routing.workPatterns.some((pattern) => matchText.includes(pattern))) return "work";
  if (routing.personalAppNames.includes(appName) || routing.personalPatterns.some((pattern) => matchText.includes(pattern))) return "personal";
  return "overall";
}
