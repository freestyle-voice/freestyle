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

function HowItWorks({
  count,
  preserveCase,
}: {
  count: number;
  preserveCase: boolean;
}) {
  return (
    <section className="card">
      <h2>How it works</h2>
      <p className="muted">
        As you dictate, the filter rewrites the final text in Freestyle's
        <code> afterCleanup </code> stage — the same step as dictionary
        replacement. It's deterministic (no AI) and adds no latency.
      </p>
      <ul className="how-list">
        <li>
          <strong>{count}</strong> curse words and phrases are swapped for
          wholesome, funnier stand-ins.
        </li>
        <li>
          Matching is <strong>case-insensitive</strong> and on{" "}
          <strong>word boundaries</strong> — so “class” and “hello” are never
          touched.
        </li>
        <li>
          <strong>Phrases win over words</strong> — “son of a bitch” → “son of a
          biscuit”, not “son of a meanie”.
        </li>
        <li>
          Casing is {preserveCase ? <strong>mirrored</strong> : "not mirrored"}{" "}
          {preserveCase ? "(SHIT → SUGAR, Damn → Dang)" : ""}, and words with
          several options cycle through them for variety.
        </li>
      </ul>
    </section>
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
        Type a sentence to preview exactly what the filter would produce.
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
      <header className="page-head">
        <h1>Profanity Filter</h1>
        <p className="muted">
          Keeps your dictation family-friendly — and funnier.
        </p>
      </header>

      {state.status === "loading" && <p className="muted">Loading…</p>}

      {state.status === "error" && (
        <section className="card error">
          <p>Couldn't load the filter: {state.message}</p>
        </section>
      )}

      {state.status === "ready" && (
        <>
          <HowItWorks
            count={state.data.count}
            preserveCase={state.data.preserveCase}
          />
          <TryIt map={map} preserveCase={state.data.preserveCase} />
          <WordList entries={state.data.replacements} />
        </>
      )}
    </main>
  );
}
