import type {
  CleanupAppAssignment,
  CleanupToneDestination,
} from "@freestyle-voice/validations";
import { parseAppContextPayload } from "./app-context.js";
import { getCleanupPromptConfig } from "./prompt-config.js";

export interface RewritePromptContext {
  destination: CleanupToneDestination;
  personalSurface: "discord" | null;
}

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

  const routing = getCleanupPromptConfig().routing;
  const ctx = parseAppContextPayload(rawContext);
  const appName = normalizeAppName(ctx?.app);
  const matchText = buildMatchContext(rawContext).toLowerCase();
  const personalSurface =
    matchesAny(appName, routing.discordPatterns) ||
    matchesAny(matchText, routing.discordPatterns)
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

  if (routing.emailAppNames.includes(appName)) {
    return { destination: "email", personalSurface: null };
  }
  if (routing.workAppNames.includes(appName)) {
    return { destination: "work", personalSurface: null };
  }
  if (routing.personalAppNames.includes(appName)) {
    return { destination: "personal", personalSurface };
  }

  if (!matchText) return { destination: "overall", personalSurface: null };

  if (matchesAny(matchText, routing.emailPatterns)) {
    return { destination: "email", personalSurface: null };
  }
  if (matchesAny(matchText, routing.workPatterns)) {
    return { destination: "work", personalSurface: null };
  }
  if (matchesAny(matchText, routing.personalPatterns)) {
    return { destination: "personal", personalSurface };
  }

  return { destination: "overall", personalSurface: null };
}
