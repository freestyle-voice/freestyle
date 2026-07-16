import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FreestyleBridge } from "freestyle-voice";

type PlacementMode = "after" | "replace";

interface EmojiSettings {
  placement: PlacementMode;
}

/**
 * Derive the settings API route from the page URL. Plugin UI is served at
 * `/api/plugins/<slug>/ui/...`, so we extract the slug from the path. This
 * makes the UI work for both the production install and the `-dev` linked copy.
 */
function getRoute(): string {
  const match = window.location.pathname.match(/\/api\/plugins\/([^/]+)\/ui\//);
  const slug = match?.[1] ?? "freestyle-voice-plugin-emoji";
  return `/api/plugins/${slug}/settings`;
}

function getBridge(): FreestyleBridge {
  const b = window.freestyle;
  if (!b) throw new Error("Host bridge unavailable.");
  return b;
}

function assertResponse(res: unknown): asserts res is Response {
  if (
    !res ||
    typeof (res as Response).status !== "number" ||
    typeof (res as Response).json !== "function"
  ) {
    throw new Error(
      "plugin API unavailable — the host bridge is out of date; try restarting Freestyle",
    );
  }
}

async function fetchSettings(): Promise<EmojiSettings> {
  const res = await getBridge().api(getRoute());
  assertResponse(res);
  if (!res.ok) throw new Error(`server returned ${res.status}`);
  return (await res.json()) as EmojiSettings;
}

async function updateSettings(settings: EmojiSettings): Promise<EmojiSettings> {
  const res = await getBridge().api(getRoute(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  assertResponse(res);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `server returned ${res.status}`);
  }
  return (await res.json()) as EmojiSettings;
}

interface PlacementOptionProps {
  value: PlacementMode;
  label: string;
  description: string;
  example: string;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}

function PlacementOption({
  label,
  description,
  example,
  selected,
  onSelect,
  disabled,
}: PlacementOptionProps) {
  return (
    <button
      type="button"
      className={`option-card${selected ? " option-card-selected" : ""}`}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
    >
      <div className="option-marker" />
      <div className="option-content">
        <span className="option-label">{label}</span>
        <span className="option-desc">{description}</span>
        <span className="option-example">{example}</span>
      </div>
    </button>
  );
}

export function App() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["emoji-settings"],
    queryFn: fetchSettings,
  });

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (updated) => {
      queryClient.setQueryData(["emoji-settings"], updated);
    },
  });

  const current = data?.placement ?? "after";

  const handleSelect = (mode: PlacementMode) => {
    if (mode === current || mutation.isPending) return;
    mutation.mutate({ placement: mode });
  };

  return (
    <main className="page">
      <h1 className="page-title">
        <span className="title-accent">Emoji</span>
        <span>. </span>
      </h1>
      <p className="page-subtitle">
        Adds emojis to casual and conversational text while you dictate. Formal
        or professional text is left untouched.
      </p>

      {isLoading && <p className="muted">Loading...</p>}

      {error && (
        <section className="card error">
          <p>
            Couldn{"'"}t load settings:{" "}
            {error instanceof Error ? error.message : String(error)}
          </p>
        </section>
      )}

      <div className="grid">
        {data && (
          <section className="card">
            <h2>Placement mode</h2>
            <p className="muted">Choose how emojis are added to your text.</p>
            <div className="options">
              <PlacementOption
                value="after"
                label="Add after words"
                description="Emojis are placed after the word or phrase they relate to."
                example={'"I love this idea \u{1F60D}"'}
                selected={current === "after"}
                onSelect={() => handleSelect("after")}
                disabled={mutation.isPending}
              />
              <PlacementOption
                value="replace"
                label="Replace words"
                description="Emotionally expressive words are replaced with a matching emoji."
                example={'"I \u{2764}\uFE0F this idea"'}
                selected={current === "replace"}
                onSelect={() => handleSelect("replace")}
                disabled={mutation.isPending}
              />
            </div>
            {mutation.error && (
              <p className="setting-error">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : String(mutation.error)}
              </p>
            )}
          </section>
        )}

        <section className="card info-card">
          <h2>How it works</h2>
          <ul className="info-list">
            <li>
              The plugin injects an emoji instruction into the LLM cleanup
              prompt.
            </li>
            <li>
              The LLM decides where emojis fit based on the tone of your speech.
            </li>
            <li>Formal or professional text is never modified.</li>
            <li>Emojis are used sparingly — at most 2-3 per paragraph.</li>
            <li>Requires LLM cleanup to be enabled in Settings.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
