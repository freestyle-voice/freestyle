import { captureSuggestion } from "@renderer/lib/analytics";
import {
  dismissedOpenerIds,
  dismissOpener,
  fetchOpeners,
  type OpenerCard,
} from "@renderer/lib/openers";
import { queryKeys } from "@renderer/lib/query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useRef, useState } from "react";

/**
 * One suggestion, above the composer, in a thread that already has messages.
 *
 * The opener cards only render on an empty thread, and the panel boots into
 * the latest one — so past the first conversation the discovery surface was
 * invisible. This is the same query and the same dismissal set, narrowed to a
 * single prompt row so it can sit under a live conversation without competing
 * with it.
 */
export function SuggestionStrip({
  busy,
  onPrompt,
}: {
  busy: boolean;
  onPrompt: (text: string) => void;
}): React.JSX.Element | null {
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);
  const reportedFor = useRef<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.openers,
    queryFn: fetchOpeners,
    staleTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const dismissed = new Set(dismissedOpenerIds());
  const card: OpenerCard | undefined = (query.data?.cards ?? []).find(
    (candidate) =>
      candidate.kind === "prompt" &&
      !!candidate.action.prompt &&
      !dismissed.has(candidate.id),
  );

  useEffect(() => {
    if (!card || reportedFor.current === card.id) return;
    reportedFor.current = card.id;
    captureSuggestion("shown", "strip", {
      id: card.id,
      category: card.category,
    });
  }, [card]);

  if (!card?.action.prompt) return null;
  const prompt = card.action.prompt;

  const dismiss = (): void => {
    dismissOpener(card.id);
    setTick((value) => value + 1);
    captureSuggestion("dismissed", "strip", {
      id: card.id,
      category: card.category,
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.openers });
  };

  return (
    <div className="tavern-strip">
      <button
        type="button"
        className="tavern-strip-main"
        disabled={busy}
        onClick={() => {
          captureSuggestion("accepted", "strip", {
            id: card.id,
            category: card.category,
          });
          dismissOpener(card.id);
          onPrompt(prompt);
        }}
      >
        <span className="tavern-strip-mark" aria-hidden="true">
          ✦
        </span>
        <span className="tavern-strip-title">{card.title}</span>
      </button>
      <button
        type="button"
        className="tavern-strip-x"
        aria-label="Dismiss suggestion"
        onClick={dismiss}
      >
        ×
      </button>
    </div>
  );
}
