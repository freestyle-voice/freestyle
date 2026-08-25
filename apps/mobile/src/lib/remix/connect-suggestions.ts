export type ConnectSuggestion = {
  slug: string;
  name: string;
  description?: string;
};

export function connectedSuggestionSlugs(
  connections: ReadonlyArray<{ toolkitSlug: string; status: string }>,
): Set<string> {
  return new Set(
    connections
      .filter((connection) => connection.status === "active")
      .map((connection) => connection.toolkitSlug),
  );
}

export function parseConnectSuggestions(output: unknown): ConnectSuggestion[] {
  const suggestions = (output as { suggestions?: unknown } | null)?.suggestions;
  if (!Array.isArray(suggestions)) return [];
  return suggestions
    .filter(
      (suggestion): suggestion is ConnectSuggestion =>
        Boolean(suggestion) &&
        typeof (suggestion as ConnectSuggestion).slug === "string" &&
        typeof (suggestion as ConnectSuggestion).name === "string",
    )
    .slice(0, 3);
}
