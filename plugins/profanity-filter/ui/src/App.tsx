import type { FreestyleBridge } from "freestyle-voice";
import { useCallback, useEffect, useRef, useState } from "react";

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

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ReplacementsResponse };

function useReplacements() {
  const [state, setState] = useState<Load>({ status: "loading" });

  const load = useCallback(async () => {
    const bridge: FreestyleBridge | undefined = window.freestyle;
    if (!bridge) {
      setState({ status: "error", message: "Host bridge unavailable." });
      return;
    }
    try {
      const res = await bridge.api(ROUTE);
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = await res.json<ReplacementsResponse>();
      setState({ status: "ready", data });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}

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

function AddWordForm({ onAdd }: { onAdd: () => void }) {
  const [word, setWord] = useState("");
  const [alts, setAlts] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bridge = window.freestyle;
    if (!bridge) return;

    const trimmedWord = word.trim();
    const alternatives = alts
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!trimmedWord || alternatives.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      const res = await bridge.api(ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: trimmedWord, alternatives }),
      });
      if (!res.ok) {
        const body = await res.json<{ error?: string }>();
        throw new Error(body.error ?? `server returned ${res.status}`);
      }
      setWord("");
      setAlts("");
      onAdd();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-form" onSubmit={(e) => void submit(e)}>
      <span className="add-label">Add a word</span>
      <div className="add-fields">
        <input
          className="add-input"
          type="text"
          placeholder="Word or phrase…"
          value={word}
          onChange={(e) => setWord(e.target.value)}
        />
        <input
          className="add-input add-input-wide"
          type="text"
          placeholder="Replacements (comma-separated)…"
          value={alts}
          onChange={(e) => setAlts(e.target.value)}
        />
        <button type="submit" className="add-btn" disabled={busy}>
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {error ? <p className="add-error">{error}</p> : null}
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
              <span key={a} className="alt">
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

function WordList({
  entries,
  onReload,
}: {
  entries: Entry[];
  onReload: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? entries.filter(
        (e) =>
          e.word.includes(q) ||
          e.alternatives.some((a) => a.toLowerCase().includes(q)),
      )
    : entries;

  const bridge = window.freestyle;

  const deleteWord = async (word: string) => {
    if (!bridge) return;
    await bridge.api(ROUTE, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word }),
    });
    onReload();
  };

  const updateWord = async (word: string, alternatives: string[]) => {
    if (!bridge) return;
    await bridge.api(ROUTE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word, alternatives }),
    });
    onReload();
  };

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
              onDelete={() => void deleteWord(e.word)}
              onUpdate={(alts) => void updateWord(e.word, alts)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function App() {
  const { state, reload } = useReplacements();
  const [resetting, setResetting] = useState(false);

  const resetToDefaults = async () => {
    const bridge = window.freestyle;
    if (!bridge) return;
    setResetting(true);
    try {
      await bridge.api(`${ROUTE}/reset`, { method: "POST" });
      await reload();
    } finally {
      setResetting(false);
    }
  };

  return (
    <main className="page">
      <BackButton />
      <header className="head-row">
        <h1 className="page-title">Filtered words</h1>
        <button
          type="button"
          className="reset-btn"
          disabled={resetting}
          onClick={() => void resetToDefaults()}
        >
          {resetting ? "Resetting…" : "Reset to defaults"}
        </button>
      </header>

      {state.status === "error" && (
        <section className="card error">
          <p>Couldn't load the filter: {state.message}</p>
        </section>
      )}

      {state.status === "ready" && (
        <>
          <AddWordForm onAdd={() => void reload()} />
          <WordList entries={state.data.replacements} onReload={reload} />
        </>
      )}
    </main>
  );
}
