import type {
  CleanupAppAssignment,
  CleanupToneDestination,
} from "@freestyle-voice/validations";
import { resolveCleanupToneDestination } from "@freestyle-voice/validations";
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

export function getRewritePromptContext(
  rawContext: string | null,
  assignments: readonly CleanupAppAssignment[] = [],
): RewritePromptContext {
  if (!rawContext) {
    return { destination: "overall", personalSurface: null };
  }

  const routing = getCleanupPromptConfig().routing;
  const ctx = parseAppContextPayload(rawContext);
  const matchText = buildMatchContext(rawContext).toLowerCase();
  const personalSurface =
    matchesAny(ctx?.app?.trim().toLowerCase() ?? "", routing.discordPatterns) ||
    matchesAny(matchText, routing.discordPatterns)
      ? "discord"
      : null;

  const destination = resolveCleanupToneDestination(
    {
      appName: ctx?.app,
      title: ctx?.title,
      windowTitle: ctx?.windowTitle,
      url: ctx?.url,
    },
    assignments,
    routing,
  );
  return { destination, personalSurface: destination === "personal" ? personalSurface : null };
}
