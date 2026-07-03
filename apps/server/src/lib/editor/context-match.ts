import { parseAppContextPayload } from "./app-context.js";

const TITLE_SEPARATORS = /\s+[-|·—–/]\s+/;

export interface MatchableContext {
  full: string;
  host: string;
  segments: string[];
}

export function buildMatchableContext(
  rawContext: string | null,
): MatchableContext | null {
  if (!rawContext) return null;

  const ctx = parseAppContextPayload(rawContext);
  if (!ctx) {
    const raw = rawContext.trim().toLowerCase();
    return raw ? { full: raw, host: "", segments: [raw] } : null;
  }

  const parts: string[] = [];
  if (ctx.url) parts.push(ctx.url);
  if (ctx.title) parts.push(ctx.title);
  if (ctx.windowTitle) parts.push(ctx.windowTitle);
  if (ctx.app) parts.push(ctx.app);
  if (parts.length === 0) return null;

  let host = "";
  if (ctx.url) {
    try {
      host = new URL(ctx.url).hostname.toLowerCase();
    } catch {
      host = ctx.url.toLowerCase();
    }
  }

  const segments = new Set<string>();
  if (ctx.app) segments.add(ctx.app.trim().toLowerCase());
  for (const title of [ctx.title, ctx.windowTitle]) {
    if (!title) continue;
    for (const segment of title.split(TITLE_SEPARATORS)) {
      const trimmed = segment.trim().toLowerCase();
      if (trimmed) segments.add(trimmed);
    }
  }

  return {
    full: parts.join(" ").toLowerCase(),
    host,
    segments: [...segments],
  };
}

// Domain/phrase patterns match as substrings; bare words match only the app
// name, a title segment, or the URL host — never prose inside a title.
export function patternMatchesContext(
  ctx: MatchableContext,
  appPattern: string,
): boolean {
  for (const raw of appPattern.split("|")) {
    const pattern = raw.trim().toLowerCase();
    if (!pattern) continue;
    if (pattern.includes(".") || pattern.includes(" ")) {
      if (ctx.full.includes(pattern)) return true;
    } else if (ctx.segments.includes(pattern) || ctx.host.includes(pattern)) {
      return true;
    }
  }
  return false;
}
