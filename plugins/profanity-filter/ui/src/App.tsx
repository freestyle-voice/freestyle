import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FreestyleBridge } from "freestyle-voice";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

const ROUTE = "/api/plugins/freestyle-voice-profanity-filter/replacements";

interface Entry {
  word: string;
  alternatives: string[];
}

interface ReplacementsResponse {
  preserveCase: boolean;
  count: number;
  replacements: Entry[];
}

function getBridge(): FreestyleBridge {
  const b = window.freestyle;
  if (!b) throw new Error("Host bridge unavailable.");
  return b;
}

async function fetchReplacements(): Promise<ReplacementsResponse> {
  const res = await getBridge().api(ROUTE);
  if (!res.ok) throw new Error(`server returned ${res.status}`);
  return res.json<ReplacementsResponse>();
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function BackButton() {
  return (
    <button
      type="button"
      className="back-btn"
      onClick={() => window.freestyle?.invoke("navigate", { to: "/plugins" })}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      Plugins
    </button>
  );
}

interface AddFormValues {
  word: string;
  alternatives: string;
}

function AddWordForm() {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddFormValues>();

  const mutation = useMutation({
    mutationFn: async (data: AddFormValues) => {
      const alternatives = data.alternatives
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (alternatives.length === 0)
        throw new Error("At least one replacement is required");
      const res = await getBridge().api(ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: data.word.trim(), alternatives }),
      });
      if (!res.ok) {
        const body = await res.json<{ error?: string }>();
        throw new Error(body.error ?? `server returned ${res.status}`);
      }
    },
    onSuccess: () => {
      reset();
      queryClient.invalidateQueries({ queryKey: ["replacements"] });
    },
  });

  const onSubmit = handleSubmit((data) => mutation.mutate(data));

  return (
    <form className="add-form" onSubmit={onSubmit}>
      <span className="add-label">Add a word</span>
      <div className="add-fields">
        <input
          className="add-input"
          type="text"
          placeholder="Word or phrase…"
          {...register("word", { required: true })}
          aria-invalid={errors.word ? "true" : undefined}
        />
        <input
          className="add-input add-input-wide"
          type="text"
          placeholder="Replacements (comma-separated)…"
          {...register("alternatives", { required: true })}
          aria-invalid={errors.alternatives ? "true" : undefined}
        />
        <button type="submit" className="add-btn" disabled={mutation.isPending}>
          {mutation.isPending ? "Adding…" : "Add"}
        </button>
      </div>
      {mutation.error ? (
        <p className="add-error">{mutation.error.message}</p>
      ) : null}
    </form>
  );
}

function WordRow({
  entry,
  onDelete,
  onUpdate,
}: {
  entry: Entry;
  onDelete: () => void;
  onUpdate: (alts: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setEditValue(entry.alternatives.join(", "));
    setEditing(true);
  };

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  const saveEdit = () => {
    const alts = editValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (alts.length > 0) onUpdate(alts);
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  return (
    <li className="word-row">
      <span className="word">{entry.word}</span>
      <span className="arrow">→</span>
      {editing ? (
        <span className="edit-inline">
          <input
            ref={editRef}
            className="edit-input"
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit();
              if (e.key === "Escape") cancelEdit();
            }}
          />
          <button type="button" className="row-btn save-btn" onClick={saveEdit}>
            Save
          </button>
          <button
            type="button"
            className="row-btn cancel-btn"
            onClick={cancelEdit}
          >
            Cancel
          </button>
        </span>
      ) : (
        <>
          <span className="alts">
            {entry.alternatives.map((a, i) => (
              <span key={`${a}-${i}`} className="alt">
                {a}
                {i < entry.alternatives.length - 1 ? " · " : ""}
              </span>
            ))}
          </span>
          <span className="row-actions">
            <button
              type="button"
              className="row-btn"
              onClick={startEdit}
              aria-label="Edit"
            >
              Edit
            </button>
            <button
              type="button"
              className="row-btn delete-btn"
              onClick={onDelete}
              aria-label="Delete"
            >
              Delete
            </button>
          </span>
        </>
      )}
    </li>
  );
}

function WordList({ entries }: { entries: Entry[] }) {
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const q = query.trim().toLowerCase();
  const filtered = q
    ? entries.filter(
        (e) =>
          e.word.includes(q) ||
          e.alternatives.some((a) => a.toLowerCase().includes(q)),
      )
    : entries;

  const deleteMutation = useMutation({
    mutationFn: async (word: string) => {
      await getBridge().api(ROUTE, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word }),
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["replacements"] }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      word,
      alternatives,
    }: {
      word: string;
      alternatives: string[];
    }) => {
      await getBridge().api(ROUTE, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, alternatives }),
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["replacements"] }),
  });

  return (
    <section className="card">
      <div className="list-head">
        <h2>
          Filtered words
          <span className="list-count">{entries.length}</span>
        </h2>
        <input
          className="search"
          type="search"
          placeholder="Search words…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {filtered.length === 0 ? (
        <p className="muted">No matches.</p>
      ) : (
        <ul className="word-grid">
          {filtered.map((e) => (
            <WordRow
              key={e.word}
              entry={e}
              onDelete={() => deleteMutation.mutate(e.word)}
              onUpdate={(alts) =>
                updateMutation.mutate({ word: e.word, alternatives: alts })
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function App() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["replacements"],
    queryFn: fetchReplacements,
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      await getBridge().api(`${ROUTE}/reset`, { method: "POST" });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["replacements"] }),
  });

  return (
    <main className="page">
      <BackButton />
      <header className="head-row">
        <h1 className="page-title">Filtered words</h1>
        <button
          type="button"
          className="reset-btn"
          disabled={resetMutation.isPending}
          onClick={() => resetMutation.mutate()}
        >
          {resetMutation.isPending ? "Resetting…" : "Reset to defaults"}
        </button>
      </header>

      {isLoading && <p className="muted">Loading…</p>}

      {error && (
        <section className="card error">
          <p>
            Couldn't load the filter:{" "}
            {error instanceof Error ? error.message : String(error)}
          </p>
        </section>
      )}

      {data && (
        <>
          <AddWordForm />
          <WordList entries={data.replacements} />
        </>
      )}
    </main>
  );
}
