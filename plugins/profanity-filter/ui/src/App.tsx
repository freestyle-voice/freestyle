import type { FreestyleBridge } from "freestyle-voice";
import { useEffect, useMemo, useState } from "react";
import {
  buildMatchers,
  clean,
  type ReplacementMap,
} from "../../src/replacements.js";

const ROUTE = "/api/plugins/freestyle-voice-profanity-filter/replacements";
const DEMO_DEFAULT = "What the hell, this damn thing is broken and I'm pissed.";

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

function useReplacements(): Load {
  const [state, setState] = useState<Load>({ status: "loading" });

  useEffect(() => {
    const bridge: FreestyleBridge | undefined = window.freestyle;
    if (!bridge) {
      setState({ status: "error", message: "Host bridge unavailable." });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await bridge.api(ROUTE);
        if (!res.ok) throw new Error(`server returned ${res.status}`);
        const data = await res.json<ReplacementsResponse>();
        if (!cancelled) setState({ status: "ready", data });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function BackButton() {
  const handleBack = () => {
    window.freestyle?.invoke("navigate", { to: "/plugins" });
  };
  return (
    <button type="button" className="back-btn" onClick={handleBack}>
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

function TryIt({
  map,
  preserveCase,
}: {
  map: ReplacementMap;
  preserveCase: boolean;
}) {
  const [text, setText] = useState(DEMO_DEFAULT);
  const matchers = useMemo(() => buildMatchers(map), [map]);
  const output = useMemo(
    () => clean(text, matchers, preserveCase),
    [text, matchers, preserveCase],
  );
  const changed = output !== text;

  return (
    <section className="card">
      <h2>Try it</h2>
      <p className="muted">
        Type a sentence to preview what the filter produces.
      </p>
      <textarea
        className="demo-input"
        rows={2}
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={`demo-output ${changed ? "is-changed" : ""}`}>
        {output || <span className="muted">…</span>}
      </div>
    </section>
  );
}

function WordList({ entries }: { entries: Entry[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? entries.filter(
        (e) =>
          e.word.includes(q) ||
          e.alternatives.some((a) => a.toLowerCase().includes(q)),
      )
    : entries;

  return (
    <section className="card">
      <div className="list-head">
        <h2>Filtered words</h2>
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
            <li key={e.word} className="word-row">
              <span className="word">{e.word}</span>
              <span className="arrow">→</span>
              <span className="alts">
                {e.alternatives.map((a, i) => (
                  <span key={a} className="alt">
                    {a}
                    {i < e.alternatives.length - 1 ? " · " : ""}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function App() {
  const state = useReplacements();

  const map = useMemo<ReplacementMap>(() => {
    if (state.status !== "ready") return {};
    return Object.fromEntries(
      state.data.replacements.map((e) => [e.word, e.alternatives]),
    );
  }, [state]);

  return (
    <main className="page">
      <BackButton />
      <header className="head">
        <p className="eyebrow">Profanity filter</p>
        <h1 className="title">
          <em>Filtered</em> words.
        </h1>
        <p className="lede">
          {state.status === "ready"
            ? `${state.data.count} words and phrases are swapped for wholesome, funnier stand-ins.`
            : "Loading filter data…"}
        </p>
      </header>

      {state.status === "error" && (
        <section className="card error">
          <p>Couldn't load the filter: {state.message}</p>
        </section>
      )}

      {state.status === "ready" && (
        <>
          <TryIt map={map} preserveCase={state.data.preserveCase} />
          <WordList entries={state.data.replacements} />
        </>
      )}
    </main>
  );
}
