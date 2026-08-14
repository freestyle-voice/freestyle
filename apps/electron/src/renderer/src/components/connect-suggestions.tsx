import { ConnectorLogo } from "@renderer/components/connected-apps";
import { useConnectorConnect } from "@renderer/lib/use-connector-connect";
import type React from "react";
import { useState } from "react";

type Suggestion = {
  slug: string;
  name: string;
  logo?: string;
  description?: string;
  status?: string | null;
};

function parseSuggestions(output: unknown): Suggestion[] {
  const list = (output as { suggestions?: unknown } | null)?.suggestions;
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (item): item is Suggestion =>
        !!item &&
        typeof (item as Suggestion).slug === "string" &&
        typeof (item as Suggestion).name === "string",
    )
    .slice(0, 3);
}

/** Renders a suggest_connections tool result as connect cards instead of the
 * generic tool chip. The part is persisted with the message, so the cards
 * survive reload; dismissal is per-session only. */
export function ConnectSuggestions({
  output,
}: {
  output: unknown;
}): React.JSX.Element | null {
  const suggestions = parseSuggestions(output);
  const { connect, phases, error } = useConnectorConnect();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const visible = suggestions.filter((item) => !dismissed.has(item.slug));
  if (visible.length === 0) return null;

  return (
    <div className="tavern-connect-cards">
      {visible.map((suggestion) => {
        const phase = phases[suggestion.slug];
        return (
          <div
            key={suggestion.slug}
            className={`tavern-connect-card${phase === "connected" ? " is-connected" : ""}`}
          >
            <ConnectorLogo name={suggestion.name} logo={suggestion.logo} />
            <div className="tavern-connect-copy">
              <strong>{suggestion.name}</strong>
              {phase === "connected" ? (
                <p>Connected — ask me again and I'll use it.</p>
              ) : phase === "pending" ? (
                <p>Finish connecting in your browser…</p>
              ) : suggestion.description ? (
                <p>{suggestion.description}</p>
              ) : null}
            </div>
            {phase === "connected" ? (
              <span className="tavern-connect-done" aria-hidden="true">
                ✓
              </span>
            ) : (
              <div className="tavern-connect-actions">
                <button
                  type="button"
                  className="tavern-approve-btn tavern-approve-allow"
                  disabled={phase === "opening" || phase === "pending"}
                  onClick={() => connect(suggestion.slug)}
                >
                  {phase === "opening"
                    ? "Opening…"
                    : phase === "pending"
                      ? "Waiting…"
                      : suggestion.status === "needs_reconnect"
                        ? "Reconnect"
                        : "Connect"}
                </button>
                <button
                  type="button"
                  className="tavern-approve-btn"
                  onClick={() =>
                    setDismissed((prev) => new Set(prev).add(suggestion.slug))
                  }
                >
                  Not now
                </button>
              </div>
            )}
          </div>
        );
      })}
      {error ? (
        <p className="tavern-connect-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
