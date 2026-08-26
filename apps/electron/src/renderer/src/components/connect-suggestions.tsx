import {
  ApiKeyForm,
  ConnectorLogo,
  DEFAULT_AUTH_FIELDS,
} from "@renderer/components/connected-apps";
import { captureSuggestion } from "@renderer/lib/analytics";
import type { ConnectorAuthField } from "@renderer/lib/connectors";
import { useConnectorConnect } from "@renderer/lib/use-connector-connect";
import type React from "react";
import { useEffect, useRef, useState } from "react";

type Suggestion = {
  slug: string;
  name: string;
  logo?: string;
  description?: string;
  status?: string | null;
  authMode?: string;
  authFields?: ConnectorAuthField[];
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
 * survive reload. */
export function ConnectSuggestions({
  output,
}: {
  output: unknown;
}): React.JSX.Element | null {
  const suggestions = parseSuggestions(output);
  const { connect, connectWithCredentials, phases, error } =
    useConnectorConnect();
  const [keyFormSlug, setKeyFormSlug] = useState<string | null>(null);
  const shownRef = useRef<string | null>(null);
  const connectedRef = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (suggestions.length === 0) return;
    const signature = suggestions.map((item) => item.slug).join(",");
    if (shownRef.current === signature) return;
    shownRef.current = signature;
    captureSuggestion("shown", "chat_connect", {
      slugs: suggestions.map((item) => item.slug),
    });
  }, [suggestions]);

  useEffect(() => {
    for (const item of suggestions) {
      if (
        phases[item.slug] !== "connected" ||
        connectedRef.current.has(item.slug)
      )
        continue;
      connectedRef.current = new Set(connectedRef.current).add(item.slug);
      captureSuggestion("accepted", "chat_connect", {
        slug: item.slug,
        outcome: "connected",
      });
    }
  }, [phases, suggestions]);

  if (suggestions.length === 0) return null;

  return (
    <div className="tavern-connect-cards">
      {suggestions.map((suggestion) => {
        const phase = phases[suggestion.slug];
        const apiKey = suggestion.authMode === "api_key";
        return (
          <div
            key={suggestion.slug}
            className={`tavern-connect-card${phase === "connected" ? " is-connected" : ""}${keyFormSlug === suggestion.slug ? " has-keyform" : ""}`}
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
                  onClick={() => {
                    captureSuggestion("accepted", "chat_connect", {
                      slug: suggestion.slug,
                      outcome: "started",
                      authMode: suggestion.authMode ?? "oauth",
                    });
                    if (apiKey) {
                      setKeyFormSlug((current) =>
                        current === suggestion.slug ? null : suggestion.slug,
                      );
                    } else {
                      connect(suggestion.slug);
                    }
                  }}
                >
                  {phase === "opening"
                    ? apiKey
                      ? "Connecting…"
                      : "Opening…"
                    : phase === "pending"
                      ? "Waiting…"
                      : suggestion.status === "needs_reconnect"
                        ? "Reconnect"
                        : apiKey
                          ? "Add API key"
                          : "Connect"}
                </button>
              </div>
            )}
            {apiKey &&
            keyFormSlug === suggestion.slug &&
            phase !== "connected" ? (
              <div className="tavern-connect-keyform">
                <ApiKeyForm
                  fields={suggestion.authFields ?? DEFAULT_AUTH_FIELDS}
                  busy={phase === "opening"}
                  onSubmit={(credentials) =>
                    connectWithCredentials(suggestion.slug, credentials)
                  }
                />
              </div>
            ) : null}
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
