import type {
  CleanupAppAssignment,
  CleanupToneDestination,
} from "@freestyle-voice/validations";
import { parseAppContextPayload } from "./app-context.js";

export interface RewritePromptContext {
  destination: CleanupToneDestination;
  personalSurface: "discord" | null;
}

const EMAIL_APP_NAMES = new Set([
  "mail",
  "outlook",
  "microsoft outlook",
  "mimestream",
  "superhuman",
  "spark",
  "spark desktop",
  "canary mail",
  "thunderbird",
  "airmail",
  "em client",
  "postbox",
  "hey",
]);

const WORK_APP_NAMES = new Set([
  "slack",
  "linkedin",
  "teams",
  "microsoft teams",
]);

const PERSONAL_APP_NAMES = new Set([
  "messages",
  "imessage",
  "whatsapp",
  "telegram",
  "discord",
]);

const EMAIL_PATTERNS = [
  "mail.google.com",
  "workspace.google.com/mail",
  "gmail",
  "outlook.office.com",
  "outlook.live.com",
  "outlook.office365.com",
  "outlook.office",
  "outlook",
  "mail.yahoo.com",
  "mail.yahoo",
  "yahoo mail",
  "mail.proton.me",
  "proton.me/mail",
  "protonmail.com",
  "proton mail",
  "superhuman",
  "spark mail",
  "mimestream",
  "app.fastmail.com",
  "fastmail",
  "hey.com",
  "hey email",
  "icloud.com/mail",
  "mail.app",
  "apple mail",
  "canary mail",
] as const;

const WORK_PATTERNS = [
  "slack.com",
  "slack",
  "linkedin.com",
  "linkedin",
  "teams.microsoft.com",
  "microsoft teams",
  "teams",
] as const;

const PERSONAL_PATTERNS = [
  "messages",
  "imessage",
  "whatsapp",
  "telegram",
  "discord.com",
  "discord",
] as const;

const DISCORD_PATTERNS = ["discord.com", "discord"] as const;

export function buildMatchContext(rawContext: string | null): string {
  if (!rawContext) return "";

  const ctx = parseAppContextPayload(rawContext);
  if (!ctx) return rawContext;

  const parts: string[] = [];
  if (ctx.url) parts.push(ctx.url);
  if (ctx.title) parts.push(ctx.title);
  if (ctx.windowTitle) parts.push(ctx.windowTitle);
  if (ctx.app) parts.push(ctx.app);
  return parts.join(" ");
}

function matchesAny(matchText: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchText.includes(pattern));
}

function normalizeAppName(appName: string | undefined): string {
  return appName?.trim().toLowerCase() ?? "";
}

/**
 * Find a user assignment that routes this context into a group. App-kind
 * assignments must match the frontmost app name exactly; site-kind assignments
 * match anywhere in the URL/window text. App matches are checked first so a
 * precise native-app rule wins over a looser site substring.
 */
function matchUserAssignment(
  assignments: readonly CleanupAppAssignment[],
  appName: string,
  matchText: string,
): CleanupToneDestination | null {
  for (let index = assignments.length - 1; index >= 0; index -= 1) {
    const a = assignments[index]!;
    if (a.kind === "app" && appName && appName === a.match) {
      return a.destination;
    }
  }
  for (let index = assignments.length - 1; index >= 0; index -= 1) {
    const a = assignments[index]!;
    if (a.kind === "site" && matchText.includes(a.match)) {
      return a.destination;
    }
  }
  return null;
}

export function getRewritePromptContext(
  rawContext: string | null,
  assignments: readonly CleanupAppAssignment[] = [],
): RewritePromptContext {
  if (!rawContext) {
    return { destination: "overall", personalSurface: null };
  }

  const ctx = parseAppContextPayload(rawContext);
  const appName = normalizeAppName(ctx?.app);
  const matchText = buildMatchContext(rawContext).toLowerCase();
  const personalSurface =
    matchesAny(appName, DISCORD_PATTERNS) ||
    matchesAny(matchText, DISCORD_PATTERNS)
      ? "discord"
      : null;

  // User assignments override the built-in routing so people can pull an app
  // into whichever group they prefer.
  const assigned = matchUserAssignment(assignments, appName, matchText);
  if (assigned) {
    return {
      destination: assigned,
      personalSurface: assigned === "personal" ? personalSurface : null,
    };
  }

  if (EMAIL_APP_NAMES.has(appName)) {
    return { destination: "email", personalSurface: null };
  }
  if (WORK_APP_NAMES.has(appName)) {
    return { destination: "work", personalSurface: null };
  }
  if (PERSONAL_APP_NAMES.has(appName)) {
    return { destination: "personal", personalSurface };
  }

  if (!matchText) return { destination: "overall", personalSurface: null };

  if (matchesAny(matchText, EMAIL_PATTERNS)) {
    return { destination: "email", personalSurface: null };
  }
  if (matchesAny(matchText, WORK_PATTERNS)) {
    return { destination: "work", personalSurface: null };
  }
  if (matchesAny(matchText, PERSONAL_PATTERNS)) {
    return { destination: "personal", personalSurface };
  }

  return { destination: "overall", personalSurface: null };
}
