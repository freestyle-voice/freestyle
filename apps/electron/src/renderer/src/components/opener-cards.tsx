import {
  ApiKeyForm,
  ConnectorLogo,
  DEFAULT_AUTH_FIELDS,
} from "@renderer/components/connected-apps";
import { capture, captureSuggestion } from "@renderer/lib/analytics";
import { starterPrompts } from "@renderer/lib/onboarding-core";
import {
  applyOpenerTemplate,
  dismissedOpenerIds,
  dismissOpener,
  fetchOpeners,
  type OpenerCard,
} from "@renderer/lib/openers";
import { queryKeys } from "@renderer/lib/query";
import { useConnectorConnect } from "@renderer/lib/use-connector-connect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useRef, useState } from "react";

function FallbackStarters({
  busy,
  onPrompt,
}: {
  busy: boolean;
  onPrompt: (text: string) => void;
}): React.JSX.Element {
  return (
    <div className="tavern-openers">
      <div className="tavern-starters">
        {starterPrompts().map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="tavern-starter"
            disabled={busy}
            onClick={() => onPrompt(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OpenerCards({
  busy,
  onPrompt,
  onShowAll,
}: {
  busy: boolean;
  onPrompt: (text: string) => void;
  onShowAll?: () => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const {
    connect,
    connectWithCredentials,
    phases,
    error: connectError,
  } = useConnectorConnect();
  const [keyFormSlug, setKeyFormSlug] = useState<string | null>(null);
  const [, setDismissTick] = useState(0);
  const [applied, setApplied] = useState<ReadonlySet<string>>(new Set());
  const reportedFor = useRef<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.openers,
    queryFn: fetchOpeners,
    staleTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const applyTemplate = useMutation({
    mutationFn: applyOpenerTemplate,
    onSuccess: (result, templateId) => {
      setApplied((prev) => new Set(prev).add(templateId));
      capture("automation_applied", {
        surface: "opener",
        templateId,
        applied: result.applied.length,
        skipped: result.skipped.map((entry) => entry.reason),
      });
    },
  });

  // The session-dismissal set lives in lib/openers so it survives remounts;
  // filtering here keeps a dismissed card hidden even when the cached query
  // data still contains it.
  const dismissed = new Set(dismissedOpenerIds());
  const cards = (query.data?.cards ?? []).filter(
    (card) => !dismissed.has(card.id),
  );

  useEffect(() => {
    if (!query.data || cards.length === 0) return;
    const signature = query.data.cards.map((card) => card.id).join(",");
    if (reportedFor.current === signature) return;
    reportedFor.current = signature;
    captureSuggestion("shown", "opener", {
      cards: query.data.cards.map((card) => card.id),
      categories: query.data.cards.map((card) => card.category),
      todos: query.data.todos.length,
    });
  }, [query.data, cards.length]);

  // Every visible card dismissed → refetch so the server backfills with the
  // next-best candidates (or, when the pool is dry, resets and starts over).
  // The refetched set is exclusion-filtered server-side, so this cannot loop.
  useEffect(() => {
    if (
      query.isSuccess &&
      query.data.cards.length > 0 &&
      cards.length === 0 &&
      !query.isFetching
    ) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.openers });
    }
  }, [
    query.isSuccess,
    query.data,
    cards.length,
    query.isFetching,
    queryClient,
  ]);

  const todos = query.data?.todos ?? [];

  if (
    query.isError ||
    (query.isSuccess && query.data.cards.length === 0 && todos.length === 0)
  ) {
    return <FallbackStarters busy={busy} onPrompt={onPrompt} />;
  }
  if (!query.data || (cards.length === 0 && todos.length === 0)) {
    return <div className="tavern-openers" aria-busy="true" />;
  }

  const dismiss = (card: OpenerCard): void => {
    dismissOpener(card.id);
    setDismissTick((tick) => tick + 1);
    captureSuggestion("dismissed", "opener", {
      id: card.id,
      category: card.category,
      kind: card.kind,
    });
  };

  const refresh = (): void => {
    for (const card of cards) dismissOpener(card.id);
    setDismissTick((tick) => tick + 1);
    capture("suggestion_refreshed", {
      surface: "opener",
      ids: cards.map((card) => card.id),
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.openers });
  };

  return (
    <div className="tavern-openers">
      {todos.length > 0 ? (
        <div className="tavern-opener-todos">
          <span className="tavern-openers-label">On your list</span>
          {todos.map((todo) => (
            <div key={todo} className="tavern-opener-todo">
              <i aria-hidden="true">◇</i>
              <span className="tavern-opener-todo-text">{todo}</span>
              <button
                type="button"
                className="tavern-opener-launch"
                disabled={busy}
                onClick={() => {
                  captureSuggestion("accepted", "opener", {
                    id: "todo:launch",
                    category: "do_now",
                    kind: "todo",
                  });
                  onPrompt(`I want you to help me do this: ${todo}`);
                }}
              >
                launch ↗
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {cards.map((card) => {
        if (card.kind === "prompt" && card.action.prompt) {
          const prompt = card.action.prompt;
          return (
            <button
              key={card.id}
              type="button"
              className="tavern-opener"
              disabled={busy}
              onClick={() => {
                captureSuggestion("accepted", "opener", {
                  id: card.id,
                  category: card.category,
                  kind: card.kind,
                });
                onPrompt(prompt);
              }}
            >
              <span className="tavern-opener-title">{card.title}</span>
              <span className="tavern-opener-sub">{card.subtitle}</span>
            </button>
          );
        }
        if (card.kind === "connect" && card.action.toolkitSlug) {
          const slug = card.action.toolkitSlug;
          const name = card.action.toolkitName ?? slug;
          const phase = phases[slug];
          const apiKey = card.action.authMode === "api_key";
          return (
            <div key={card.id} className="tavern-opener is-static">
              <span className="tavern-opener-head">
                <ConnectorLogo name={name} logo={card.action.toolkitLogo} />
                <span className="tavern-opener-head-copy">
                  <span className="tavern-opener-title">{card.title}</span>
                  <span className="tavern-opener-sub">
                    {phase === "connected"
                      ? "Connected — ask and Freestyle will use it."
                      : phase === "pending"
                        ? "Finish connecting in your browser…"
                        : card.subtitle}
                  </span>
                </span>
              </span>
              {phase === "connected" ? null : (
                <span className="tavern-opener-actions">
                  <button
                    type="button"
                    className="tavern-approve-btn tavern-approve-allow"
                    disabled={phase === "opening" || phase === "pending"}
                    onClick={() => {
                      captureSuggestion("accepted", "opener", {
                        id: card.id,
                        category: card.category,
                        kind: card.kind,
                      });
                      if (apiKey) {
                        setKeyFormSlug((current) =>
                          current === slug ? null : slug,
                        );
                      } else {
                        connect(slug);
                      }
                    }}
                  >
                    {phase === "opening"
                      ? apiKey
                        ? "Connecting…"
                        : "Opening…"
                      : phase === "pending"
                        ? "Waiting…"
                        : apiKey
                          ? "Add API key"
                          : `Connect ${name}`}
                  </button>
                  <button
                    type="button"
                    className="tavern-approve-btn"
                    onClick={() => dismiss(card)}
                  >
                    Not now
                  </button>
                </span>
              )}
              {apiKey && keyFormSlug === slug && phase !== "connected" ? (
                <span className="tavern-connect-keyform">
                  <ApiKeyForm
                    fields={card.action.authFields ?? DEFAULT_AUTH_FIELDS}
                    busy={phase === "opening"}
                    onSubmit={(credentials) =>
                      connectWithCredentials(slug, credentials)
                    }
                  />
                </span>
              ) : null}
            </div>
          );
        }
        if (card.kind === "apply_template" && card.action.templateId) {
          const templateId = card.action.templateId;
          const isOn = applied.has(templateId);
          const isApplying =
            applyTemplate.isPending && applyTemplate.variables === templateId;
          return (
            <div key={card.id} className="tavern-opener is-static">
              <span className="tavern-opener-title">{card.title}</span>
              <span className="tavern-opener-sub">
                {isOn
                  ? "On. Manage it any time in your scheduled tasks."
                  : card.subtitle}
              </span>
              {isOn ? null : (
                <span className="tavern-opener-actions">
                  <button
                    type="button"
                    className="tavern-approve-btn tavern-approve-allow"
                    disabled={isApplying}
                    onClick={() => {
                      captureSuggestion("accepted", "opener", {
                        id: card.id,
                        category: card.category,
                        kind: card.kind,
                      });
                      applyTemplate.mutate(templateId);
                    }}
                  >
                    {isApplying ? "Setting up…" : "Turn on"}
                  </button>
                  <button
                    type="button"
                    className="tavern-approve-btn"
                    onClick={() => dismiss(card)}
                  >
                    Not now
                  </button>
                </span>
              )}
            </div>
          );
        }
        return null;
      })}
      {connectError ? (
        <p className="tavern-connect-error" role="alert">
          {connectError}
        </p>
      ) : null}
      {applyTemplate.isError ? (
        <p className="tavern-connect-error" role="alert">
          Couldn't set that up. Try again, or ask Freestyle in chat.
        </p>
      ) : null}
      <div className="tavern-opener-foot">
        <button type="button" className="tavern-opener-more" onClick={refresh}>
          Show me different
        </button>
        {onShowAll ? (
          <button
            type="button"
            className="tavern-opener-more"
            onClick={onShowAll}
          >
            See everything ↗
          </button>
        ) : null}
      </div>
    </div>
  );
}
