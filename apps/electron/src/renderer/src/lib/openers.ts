import { apiFetch } from "@renderer/lib/api";

export type OpenerCategory = "do_now" | "workflow" | "connect" | "automate";

export type OpenerCard = {
  id: string;
  kind: "prompt" | "connect" | "apply_template";
  category: OpenerCategory;
  title: string;
  subtitle: string;
  action: {
    prompt?: string;
    toolkitSlug?: string;
    toolkitName?: string;
    toolkitLogo?: string;
    authMode?: "oauth" | "api_key";
    authFields?: Array<{
      name: string;
      displayName: string;
      description?: string;
      required: boolean;
    }>;
    templateId?: string;
  };
};

export type OpenersResponse = {
  greeting: string;
  cards: OpenerCard[];
  /** First open items from todos.md, list order, already truncated. */
  todos: string[];
  ttlSeconds: number;
};

// Dismissals last only for the app session: "Not now" and "Show me different"
// rotate to other candidates, never permanently thin the surface. Module-level
// so the set survives tab switches and panel remounts; an app restart clears it.
const sessionDismissed = new Set<string>();

export function dismissedOpenerIds(): string[] {
  return [...sessionDismissed];
}

export function dismissOpener(id: string): void {
  sessionDismissed.add(id);
}

export function resetOpenerDismissals(): void {
  sessionDismissed.clear();
}

function parseCard(value: unknown): OpenerCard | null {
  const card = value as Partial<OpenerCard> | null;
  if (
    !card ||
    typeof card.id !== "string" ||
    typeof card.title !== "string" ||
    typeof card.subtitle !== "string" ||
    (card.kind !== "prompt" &&
      card.kind !== "connect" &&
      card.kind !== "apply_template") ||
    !card.category ||
    !card.action ||
    typeof card.action !== "object"
  ) {
    return null;
  }
  return card as OpenerCard;
}

async function fetchOpenersOnce(exclude: string[]): Promise<OpenersResponse> {
  const query = exclude.length
    ? `?exclude=${encodeURIComponent(exclude.join(","))}`
    : "";
  const res = await apiFetch(`/api/suggestions/home${query}`);
  if (!res.ok) throw new Error(`openers fetch failed: ${res.status}`);
  const data = (await res.json()) as {
    greeting?: unknown;
    cards?: unknown;
    todos?: unknown;
    ttlSeconds?: unknown;
  };
  const cards = Array.isArray(data.cards)
    ? data.cards
        .map(parseCard)
        .filter((card): card is OpenerCard => card !== null)
    : [];
  return {
    greeting: typeof data.greeting === "string" ? data.greeting : "",
    cards,
    todos: Array.isArray(data.todos)
      ? data.todos.filter((item): item is string => typeof item === "string")
      : [],
    ttlSeconds: typeof data.ttlSeconds === "number" ? data.ttlSeconds : 21_600,
  };
}

export async function fetchOpeners(): Promise<OpenersResponse> {
  const exclude = dismissedOpenerIds();
  const result = await fetchOpenersOnce(exclude);
  // Dismissing enough cards can exhaust a finite pool (connect/automate
  // rankings). Suggestions must always come back, so a dry result resets the
  // session's dismissals and refetches the full set.
  if (
    result.cards.length === 0 &&
    result.todos.length === 0 &&
    exclude.length > 0
  ) {
    resetOpenerDismissals();
    return fetchOpenersOnce([]);
  }
  return result;
}

/** Server-side counterpart to the session dismissal set: this is what makes a
 * twice-refused card stop coming back after a restart. Fire-and-forget. */
export function reportSuggestion(
  cardId: string,
  surface: string,
  action: "accepted" | "dismissed",
): void {
  void apiFetch("/api/suggestions/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId, surface, action }),
  }).catch(() => {});
}

export type ApplyTemplateResult = {
  applied: Array<{ id: string; path: string; name: string }>;
  skipped: Array<{ id: string; reason: string }>;
};

export async function applyOpenerTemplate(
  templateId: string,
): Promise<ApplyTemplateResult> {
  let timezone: string | undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = undefined;
  }
  const res = await apiFetch("/api/suggestions/apply-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId, ...(timezone ? { timezone } : {}) }),
  });
  if (!res.ok) throw new Error(`apply template failed: ${res.status}`);
  return (await res.json()) as ApplyTemplateResult;
}
