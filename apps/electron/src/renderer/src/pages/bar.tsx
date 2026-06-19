import type {
  AgentConversation,
  AgentEvent,
  AgentRunStatus,
  AgentRunSummary,
  AgentUsage,
} from "@freestyle/validations";
import { useMultibandVolume } from "@renderer/components/ui/bar-visualizer";
import { Markdown } from "@renderer/components/ui/markdown";
import { Orb } from "@renderer/components/ui/orb";
import { VoicePill } from "@renderer/components/ui/voice-pill";
import { getApiBase, getAuthHeaders, refreshApiBase } from "@renderer/lib/api";
import { Recorder } from "@renderer/lib/recorder";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";

type CaptureState = "idle" | "recording" | "transcribing";
/** A thread's status: the SDK run states plus a pre-run "idle". */
type RunStatus = "idle" | AgentRunStatus;

interface Item {
  id: string;
  role: "user" | "assistant" | "tool" | "error" | "info";
  text: string;
}

/**
 * A conversation thread shown in the left rail. Each maps to at most one *live*
 * run at a time (`runId`), but persists across runs as a conversation
 * (`sessionId`) so follow-ups resume it. Many threads can run concurrently —
 * that's the whole point of the rail.
 */
interface Thread {
  /** Stable local id (React key + active selector). */
  clientId: string;
  /** Current/last run's main-process id — events route here; null before first send. */
  runId: string | null;
  /** SDK session id once known — used to resume + reload history. */
  sessionId: string | null;
  title: string;
  items: Item[];
  status: RunStatus;
  usage: AgentUsage | null;
  draft: string;
  createdAt: number;
  /**
   * Drives the rail's sort order (most-recent-use first). Bumped on deliberate
   * use — creating, sending, opening — but NOT on mere selection or streaming,
   * so reading/clicking around never reshuffles the list.
   */
  lastActivityAt: number;
}

const MIN_RECORDING_MS = 400;

// Collapsed strip band height — matches AGENT_BAR_STRIP.height in index.ts (the
// hover rect main uses). The strip is pinned to this band at the top of the
// fixed-size window so it sits at its final position regardless of layer state.
const STRIP_H = 84;

const NEW_CHAT_TITLE = "New chat";

// ---------------------------------------------------------------------------
// Thread store (reducer) — the once-registered IPC listener dispatches into
// this, routing each event to its thread by runId. Keeping it a pure reducer is
// what makes concurrent streams safe: every event is an atomic, ordered update.
// ---------------------------------------------------------------------------

interface ThreadState {
  threads: Thread[];
  activeId: string;
  /** Monotonic counter for stable item ids (avoids per-chunk uuids). */
  seq: number;
}

type Action =
  | { kind: "new"; clientId: string }
  | { kind: "select"; clientId: string }
  | { kind: "draft"; clientId: string; draft: string }
  | { kind: "draftAppend"; clientId: string; text: string }
  | { kind: "send"; clientId: string; runId: string; prompt: string }
  | { kind: "startFailed"; clientId: string; error: string }
  | { kind: "noCompute"; clientId: string }
  | { kind: "event"; event: AgentEvent }
  | { kind: "openConversation"; clientId: string; conv: AgentConversation }
  | { kind: "loaded"; clientId: string; items: Item[] }
  | { kind: "adopt"; runs: AgentRunSummary[] };

function emptyThread(clientId: string): Thread {
  return {
    clientId,
    runId: null,
    sessionId: null,
    title: NEW_CHAT_TITLE,
    items: [],
    status: "idle",
    usage: null,
    draft: "",
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
}

function deriveTitle(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean || NEW_CHAT_TITLE;
}

function formatToolInput(input: unknown): string {
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

/** Replace one thread by clientId via an updater; identity-stable if not found. */
function mapThread(
  state: ThreadState,
  clientId: string,
  fn: (t: Thread) => Thread,
): ThreadState {
  const idx = state.threads.findIndex((t) => t.clientId === clientId);
  if (idx < 0) return state;
  const threads = [...state.threads];
  threads[idx] = fn(threads[idx]);
  return { ...state, threads };
}

function applyEvent(state: ThreadState, event: AgentEvent): ThreadState {
  const idx = state.threads.findIndex((t) => t.runId === event.runId);
  if (idx < 0) return state; // event for a run we don't track (e.g. stale)

  let seq = state.seq;
  const t0 = state.threads[idx];
  const withItem = (role: Item["role"], text: string): Thread => {
    seq += 1;
    return { ...t0, items: [...t0.items, { id: `i${seq}`, role, text }] };
  };

  let next = t0;
  switch (event.type) {
    case "status":
      next = { ...t0, status: event.status };
      break;
    case "session_info":
      next = { ...t0, sessionId: event.sessionId };
      break;
    case "assistant_text":
      next = withItem("assistant", event.text);
      break;
    case "tool_use":
      next = withItem("tool", `${event.name}(${formatToolInput(event.input)})`);
      break;
    case "result":
      next = { ...t0, usage: event.usage };
      break;
    case "error":
      next = withItem("error", event.message);
      break;
    // tool_result is intentionally not rendered (matches prior behavior).
  }

  if (next === t0) return state;
  // Keep a freshly-updated thread's session id in sync even on item events.
  if (event.sessionId && next.sessionId !== event.sessionId) {
    next = { ...next, sessionId: event.sessionId };
  }
  const threads = [...state.threads];
  threads[idx] = next;
  return { ...state, threads, seq };
}

function reducer(state: ThreadState, action: Action): ThreadState {
  switch (action.kind) {
    case "new": {
      const t = emptyThread(action.clientId);
      return { ...state, threads: [t, ...state.threads], activeId: t.clientId };
    }
    case "select":
      return { ...state, activeId: action.clientId };
    case "draft":
      return mapThread(state, action.clientId, (t) => ({
        ...t,
        draft: action.draft,
      }));
    case "draftAppend":
      return mapThread(state, action.clientId, (t) => ({
        ...t,
        draft: t.draft.trim()
          ? `${t.draft.trim()} ${action.text}`
          : action.text,
      }));
    case "send": {
      let seq = state.seq;
      const next = mapThread(state, action.clientId, (t) => {
        seq += 1;
        return {
          ...t,
          runId: action.runId,
          status: "starting" as RunStatus,
          usage: null,
          draft: "",
          lastActivityAt: Date.now(),
          title:
            t.title === NEW_CHAT_TITLE ? deriveTitle(action.prompt) : t.title,
          items: [
            ...t.items,
            { id: `i${seq}`, role: "user", text: action.prompt },
          ],
        };
      });
      return { ...next, seq };
    }
    case "startFailed": {
      let seq = state.seq;
      const next = mapThread(state, action.clientId, (t) => {
        seq += 1;
        return {
          ...t,
          status: "error" as RunStatus,
          items: [
            ...t.items,
            { id: `i${seq}`, role: "error", text: action.error },
          ],
        };
      });
      return { ...next, seq };
    }
    case "noCompute": {
      let seq = state.seq;
      const next = mapThread(state, action.clientId, (t) => {
        seq += 1;
        return {
          ...t,
          items: [
            ...t.items,
            {
              id: `i${seq}`,
              role: "info",
              text: "Another agent is controlling the screen — this run continues without computer control.",
            },
          ],
        };
      });
      return { ...next, seq };
    }
    case "openConversation": {
      const existing = state.threads.find(
        (t) => t.sessionId === action.conv.id,
      );
      if (existing) return { ...state, activeId: existing.clientId };
      const t: Thread = {
        ...emptyThread(action.clientId),
        sessionId: action.conv.id,
        title: action.conv.title,
        // Sort where the conversation already belongs by recency, so opening it
        // doesn't yank it to the top of the rail.
        lastActivityAt: action.conv.updatedAt,
      };
      return { ...state, threads: [t, ...state.threads], activeId: t.clientId };
    }
    case "loaded":
      return mapThread(state, action.clientId, (t) => ({
        ...t,
        items: action.items,
      }));
    case "adopt": {
      const known = new Set(
        state.threads.map((t) => t.runId).filter(Boolean) as string[],
      );
      const fresh: Thread[] = action.runs
        .filter((r) => !known.has(r.runId))
        .map((r) => ({
          ...emptyThread(crypto.randomUUID()),
          runId: r.runId,
          sessionId: r.sessionId || null,
          title: r.title || "Running agent",
          status: r.status,
          lastActivityAt: r.startedAt,
        }));
      if (!fresh.length) return state;
      return { ...state, threads: [...fresh, ...state.threads] };
    }
    case "event":
      return applyEvent(state, action.event);
  }
}

function initThreadState(): ThreadState {
  const t = emptyThread(crypto.randomUUID());
  return { threads: [t], activeId: t.clientId, seq: 0 };
}

function isLive(status: RunStatus): boolean {
  return status === "starting" || status === "running";
}

function dotClass(status: RunStatus): string {
  if (isLive(status)) return "bg-blue-400 animate-pulse";
  if (status === "error") return "bg-red-400";
  if (status === "done") return "bg-emerald-400";
  if (status === "canceled") return "bg-amber-400";
  return "bg-muted-foreground/40";
}

/** Per-thread status glyph for the rail: a spinner while live, a colored dot
 *  otherwise (green done · red error · amber canceled · grey idle). */
function StatusIndicator({
  status,
  title,
}: {
  status: RunStatus;
  title?: string;
}): React.JSX.Element {
  if (isLive(status)) {
    return (
      <span
        title={title}
        className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
      />
    );
  }
  return (
    <span
      title={title}
      className={`h-2 w-2 shrink-0 rounded-full ${dotClass(status)}`}
    />
  );
}

function ChevronLeftIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M10 4L6 8l4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---- consistency with the dictation pill: matching start/stop tones ----
let toneCtx: AudioContext | null = null;
function playTone(kind: "start" | "stop"): void {
  try {
    if (!toneCtx || toneCtx.state === "closed") toneCtx = new AudioContext();
    if (toneCtx.state === "suspended") void toneCtx.resume();
    const osc = toneCtx.createOscillator();
    const gain = toneCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = kind === "start" ? 880 : 660;
    gain.gain.setValueAtTime(0.18, toneCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, toneCtx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(toneCtx.destination);
    osc.start();
    osc.stop(toneCtx.currentTime + 0.1);
  } catch {}
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

// Live mic-level feedback — mirrors the dictation pill's volume meter so the
// user has a haptic-style cue that audio is being captured.
function VolumeBars({
  stream,
}: {
  stream: MediaStream | null;
}): React.JSX.Element {
  const bands = useMultibandVolume(stream, {
    bands: 5,
    loPass: 100,
    hiPass: 600,
  });
  return (
    <div className="flex h-3 items-center gap-[3px]">
      {bands.map((v, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-primary/70 transition-[height] duration-75"
          style={{ height: `${Math.max(15, Math.min(100, v * 100 + 8))}%` }}
        />
      ))}
    </div>
  );
}

export default function BarPage(): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const [state, dispatch] = useReducer(reducer, undefined, initThreadState);
  const active =
    state.threads.find((t) => t.clientId === state.activeId) ??
    state.threads[0];

  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [computeOptIn, setComputeOptIn] = useState(false);
  const [capture, setCapture] = useState<CaptureState>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [focused, setFocused] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(
    () => localStorage.getItem("agentRailCollapsed") === "1",
  );

  const toggleRail = useCallback(() => {
    setRailCollapsed((v) => {
      const next = !v;
      localStorage.setItem("agentRailCollapsed", next ? "1" : "0");
      return next;
    });
  }, []);

  const recorderRef = useRef(new Recorder());
  const captureRef = useRef<CaptureState>("idle");
  const startTimeRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedRef = useRef(false);
  const activeIdRef = useRef(state.activeId);
  // Wraps the visible collapsed pill so we can report its exact bounding box to
  // main for hover hit-testing (see the report effect below).
  const pillRef = useRef<HTMLDivElement>(null);
  // Set when a transcript lands while collapsed: focus the input once the
  // panel finishes mounting after the reveal.
  const pendingFocusRef = useRef(false);

  useEffect(() => {
    activeIdRef.current = state.activeId;
  }, [state.activeId]);

  const runningCount = state.threads.filter((t) => isLive(t.status)).length;
  const anyRunning = runningCount > 0;
  const activeRunning = isLive(active.status);
  const busy = anyRunning || capture !== "idle";

  const setCaptureState = useCallback((next: CaptureState) => {
    captureRef.current = next;
    setCapture(next);
  }, []);

  // ---- Past conversations (left-rail history) ----
  const refreshConversations = useCallback(() => {
    window.api.agent
      .listConversations()
      .then(setConversations)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshConversations();
    window.api.agent
      .getComputerUse()
      .then(setComputeOptIn)
      .catch(() => {});
    // Re-adopt any runs already in flight (e.g. after a renderer reload) so the
    // user can still see and cancel them.
    window.api.agent
      .listRunning()
      .then((runs) => {
        if (runs.length) dispatch({ kind: "adopt", runs });
      })
      .catch(() => {});
  }, [refreshConversations]);

  // ---- Expand/collapse is owned by main (cursor-driven). The bar only
  // reflects the state main pushes, and reports when it's "busy" (recording or
  // editing) so main won't auto-collapse mid-record or mid-edit. ----
  useEffect(() => {
    const off = window.api.agent.onSetExpanded((next) => {
      setExpanded(next);
      expandedRef.current = next;
      if (next && pendingFocusRef.current) {
        pendingFocusRef.current = false;
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    });
    return off;
  }, []);

  useEffect(() => {
    const composing =
      capture !== "idle" || (focused && active.draft.trim().length > 0);
    window.api.agent.setComposing(composing);
  }, [capture, focused, active.draft]);

  // ---- Auto-grow the composer with its content. Reset to "auto" first so it
  // can shrink too, then size to scrollHeight. ----
  // biome-ignore lint/correctness/useExhaustiveDependencies: also re-size when switching threads (draft swaps in)
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [active.draft, active.clientId]);

  // ---- Report the collapsed pill's real bounding box to main, so the hover
  // hit-box matches the visible pill instead of the whole strip band. ----
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the pill swaps to/from the recording state
  useEffect(() => {
    const el = pillRef.current;
    if (!el || expanded) return;
    const report = (): void => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      window.api.agent.setHoverRect({
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
      });
    };
    const raf = requestAnimationFrame(report);
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [expanded, capture]);

  // ---- Voice capture (reuses the dictation recorder + /api/transcribe) ----
  const transcribe = useCallback(
    async (wav: Blob, durationMs: number): Promise<void> => {
      const ok = await refreshApiBase();
      if (!ok) {
        setNotice("Server unreachable — quit and reopen the app.");
        return;
      }
      const res = await fetch(`${getApiBase()}/api/transcribe`, {
        method: "POST",
        body: wav,
        headers: {
          "Content-Type": "audio/wav",
          "x-audio-duration-ms": String(durationMs),
          ...getAuthHeaders(),
        },
      });
      if (!res.ok) {
        setNotice("Transcription failed.");
        return;
      }
      const data = (await res.json()) as { raw?: string; cleaned?: string };
      const text = (data.cleaned || data.raw || "").trim();
      if (!text) return;
      // Land in the active thread's editable draft — never auto-send.
      dispatch({ kind: "draftAppend", clientId: activeIdRef.current, text });
      if (expandedRef.current) {
        textareaRef.current?.focus();
      } else {
        pendingFocusRef.current = true;
        window.api.agent.reveal();
      }
    },
    [],
  );

  const startCapture = useCallback(async () => {
    if (captureRef.current !== "idle") return;
    setNotice(null);
    try {
      await recorderRef.current.start();
      setMicStream(recorderRef.current.getStream());
      startTimeRef.current = Date.now();
      playTone("start");
      setCaptureState("recording");
    } catch {
      setMicStream(null);
      setNotice("Microphone unavailable — check permissions.");
      setCaptureState("idle");
    }
  }, [setCaptureState]);

  const stopCapture = useCallback(async () => {
    if (captureRef.current !== "recording") return;
    const durationMs = Date.now() - startTimeRef.current;
    playTone("stop");
    setCaptureState("transcribing");
    try {
      const wav = await recorderRef.current.stop();
      recorderRef.current.releaseStream();
      setMicStream(null);
      if (durationMs >= MIN_RECORDING_MS) await transcribe(wav, durationMs);
    } catch {
      setMicStream(null);
      setNotice("Recording failed.");
    } finally {
      setCaptureState("idle");
    }
  }, [setCaptureState, transcribe]);

  // ---- Agent run (one per thread; many threads run in parallel) ----
  const send = useCallback(() => {
    const t = active;
    const prompt = t.draft.trim();
    if (!prompt || isLive(t.status)) return;
    // Mint the runId here so we can route the synchronous "starting" event that
    // fires before agent.start() even resolves.
    const runId = crypto.randomUUID();
    dispatch({ kind: "send", clientId: t.clientId, runId, prompt });
    setNotice(null);
    window.api.agent
      .start({ prompt, runId, resume: t.sessionId ?? undefined })
      .then((r) => {
        if (!r.ok) {
          dispatch({
            kind: "startFailed",
            clientId: t.clientId,
            error: r.error ?? "Failed to start agent.",
          });
        } else if (computeOptIn && !r.computerUse) {
          dispatch({ kind: "noCompute", clientId: t.clientId });
        }
      })
      .catch(() =>
        dispatch({
          kind: "startFailed",
          clientId: t.clientId,
          error: "Failed to start agent.",
        }),
      );
  }, [active, computeOptIn]);

  const cancel = useCallback(() => {
    if (active.runId) window.api.agent.cancel(active.runId);
  }, [active]);

  const newConversation = useCallback(() => {
    dispatch({ kind: "new", clientId: crypto.randomUUID() });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const openConversation = useCallback((conv: AgentConversation) => {
    const clientId = crypto.randomUUID();
    dispatch({ kind: "openConversation", clientId, conv });
    window.api.agent
      .getConversation(conv.id)
      .then((msgs) => {
        dispatch({
          kind: "loaded",
          clientId,
          items: msgs.map((m, i) => ({
            id: `h_${clientId}_${i}`,
            role: m.role,
            text: m.text,
          })),
        });
      })
      .catch(() => {});
  }, []);

  // ---- IPC wiring: hotkeys (re-bound when capture callbacks change) ----
  useEffect(() => {
    const offDown = window.api.agent.onHotkeyDown(() => void startCapture());
    const offUp = window.api.agent.onHotkeyUp(() => void stopCapture());
    return () => {
      offDown();
      offUp();
    };
  }, [startCapture, stopCapture]);

  // ---- IPC wiring: agent events (registered once; dispatch is stable) ----
  useEffect(() => {
    const offEvent = window.api.agent.onEvent((event: AgentEvent) => {
      dispatch({ kind: "event", event });
      if (
        event.type === "status" &&
        (event.status === "done" || event.status === "error")
      ) {
        refreshConversations();
      }
    });
    return offEvent;
  }, [refreshConversations]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on stream updates and on switch/open
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [active.items, active.usage, active.clientId, expanded]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      } else if (e.key === "Escape") {
        textareaRef.current?.blur();
      }
    },
    [send],
  );

  const orbColors: [string, string] =
    capture === "recording"
      ? ["#8AB62A", "#6B8F12"]
      : busy
        ? ["#60A5FA", "#3B82F6"]
        : ["#A78BFA", "#7C3AED"];
  const orbState =
    capture === "recording" ? "listening" : busy ? "talking" : null;

  // One unified, recency-sorted rail: open threads + past conversations not
  // already open, in a SINGLE list sorted by most-recent-use. Selection and
  // streaming don't change sort keys, so clicking around never reshuffles.
  const openSessionIds = new Set(
    state.threads.map((t) => t.sessionId).filter(Boolean) as string[],
  );
  type RailItem =
    | { key: string; sortKey: number; kind: "thread"; thread: Thread }
    | { key: string; sortKey: number; kind: "past"; conv: AgentConversation };
  const railItems: RailItem[] = [
    ...state.threads.map(
      (t): RailItem => ({
        key: t.clientId,
        sortKey: t.lastActivityAt,
        kind: "thread",
        thread: t,
      }),
    ),
    ...conversations
      .filter((c) => !openSessionIds.has(c.id))
      .map(
        (c): RailItem => ({
          key: `past_${c.id}`,
          sortKey: c.updatedAt,
          kind: "past",
          conv: c,
        }),
      ),
  ].sort((a, b) => b.sortKey - a.sortKey);
  // Threads only (collapsed rail shows status glyphs), same recency order.
  const railThreads = [...state.threads].sort(
    (a, b) => b.lastActivityAt - a.lastActivityAt,
  );

  // ---- Persistent shell -----------------------------------------------------
  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{glowKeyframes}</style>

      {/* Collapsed layer: slim strip (or the recording pill), pinned to the top
          band so it never shifts. Fades out as the panel takes over. */}
      <div
        className={`absolute inset-x-0 top-0 flex items-center justify-center transition-[opacity,transform] duration-150 ease-out ${
          expanded ? "pointer-events-none scale-95 opacity-0" : "opacity-100"
        }`}
        style={{ height: STRIP_H }}
      >
        {/* Content-sized wrapper: its bounding box is the hover hit-box. */}
        <div ref={pillRef} className="inline-flex">
          {capture !== "idle" ? (
            <VoicePill
              state={capture === "recording" ? "recording" : "transcribing"}
              stream={micStream}
              draggable={false}
              align="center"
            />
          ) : (
            <div
              className={`flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1 text-xs text-foreground shadow-sm backdrop-blur ${
                busy ? "glow-agent-busy" : ""
              }`}
            >
              <div className="h-4 w-4 overflow-hidden rounded-full">
                <Orb
                  colors={orbColors}
                  agentState={orbState}
                  className="h-full w-full"
                />
              </div>
              <span className="text-muted-foreground">
                {anyRunning
                  ? runningCount > 1
                    ? `Working… (${runningCount})`
                    : "Working…"
                  : "Freestyle Code"}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  anyRunning
                    ? "bg-blue-400 animate-pulse"
                    : "bg-muted-foreground/40"
                }`}
              />
            </div>
          )}
        </div>
      </div>

      {/* Expanded panel: fills the window. Left rail of threads + active thread. */}
      <div
        className={`absolute inset-0 flex origin-top overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl transition-[opacity,transform] duration-150 ease-out ${
          expanded
            ? "opacity-100"
            : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"
        }`}
      >
        {/* ---- Left rail: collapsible thread tabs (Claude-Desktop style) ---- */}
        {railCollapsed ? (
          <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-background/40 py-1.5">
            <button
              type="button"
              onClick={toggleRail}
              title="Expand sidebar"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronRightIcon />
            </button>
            <button
              type="button"
              onClick={newConversation}
              title="New chat"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span className="text-base leading-none">+</span>
            </button>
            <div
              className="mt-1 flex flex-1 flex-col items-center gap-1.5 overflow-y-auto"
              style={{ scrollbarWidth: "none" }}
            >
              {railThreads.map((t) => (
                <button
                  type="button"
                  key={t.clientId}
                  title={t.title}
                  onClick={() =>
                    dispatch({ kind: "select", clientId: t.clientId })
                  }
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    t.clientId === state.activeId
                      ? "bg-muted"
                      : "hover:bg-muted/60"
                  }`}
                >
                  <StatusIndicator status={t.status} title={t.title} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex w-44 shrink-0 flex-col border-r border-border bg-background/40">
            <div className="flex items-center gap-1 px-1.5 pt-1.5">
              <button
                type="button"
                onClick={newConversation}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span className="text-sm leading-none">+</span> New chat
              </button>
              <button
                type="button"
                onClick={toggleRail}
                title="Collapse sidebar"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeftIcon />
              </button>
            </div>
            <div
              className="mt-1 flex-1 overflow-y-auto px-1 pb-2"
              style={{ scrollbarWidth: "none" }}
            >
              {railItems.map((item) =>
                item.kind === "thread" ? (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() =>
                      dispatch({
                        kind: "select",
                        clientId: item.thread.clientId,
                      })
                    }
                    className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                      item.thread.clientId === state.activeId
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <StatusIndicator status={item.thread.status} />
                    <span className="flex-1 truncate">{item.thread.title}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => openConversation(item.conv)}
                    className="mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/30" />
                    <span className="flex-1 truncate">{item.conv.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground/70">
                      {relativeTime(item.conv.updatedAt)}
                    </span>
                  </button>
                ),
              )}
            </div>
          </div>
        )}

        {/* ---- Active thread: header + transcript + composer ---- */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <div className="h-5 w-5 overflow-hidden rounded-full">
              <Orb
                colors={orbColors}
                agentState={orbState}
                className="h-full w-full"
              />
            </div>
            <span className="flex-1 truncate text-sm font-semibold">
              {active.title}
            </span>
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(active.status)}`}
            />
          </div>

          {/* Transcript */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 py-2 text-sm"
          >
            {active.items.length === 0 && (
              <p className="mt-6 text-center text-xs text-muted-foreground">
                Hold the agent hotkey and speak, edit, then press Enter to run.
              </p>
            )}
            {active.items.map((item) => (
              <div key={item.id} className="mb-2.5">
                {item.role === "user" && (
                  <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary/10 px-3 py-1.5 text-foreground">
                    {item.text}
                  </div>
                )}
                {item.role === "assistant" && (
                  <Markdown className="max-w-[92%]">{item.text}</Markdown>
                )}
                {item.role === "tool" && (
                  <div className="font-mono text-[11px] text-blue-400 break-words">
                    ⚙ {item.text}
                  </div>
                )}
                {item.role === "info" && (
                  <div className="text-[11px] italic text-muted-foreground">
                    {item.text}
                  </div>
                )}
                {item.role === "error" && (
                  <div className="text-red-400">⚠ {item.text}</div>
                )}
              </div>
            ))}
            {activeRunning && (
              <p className="text-xs text-muted-foreground animate-pulse">
                {active.status === "starting" ? "Starting…" : "Working…"}
              </p>
            )}
            {active.usage && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                {active.usage.inputTokens}↓ {active.usage.outputTokens}↑ tokens
                {typeof active.usage.costUsd === "number"
                  ? ` · $${active.usage.costUsd.toFixed(4)}`
                  : ""}
                {active.status === "canceled" ? " · canceled" : ""}
              </p>
            )}
          </div>

          {(notice || capture !== "idle") && (
            <div className="flex items-center gap-2 px-3 pb-1 text-[11px] text-muted-foreground">
              {capture === "recording" && <VolumeBars stream={micStream} />}
              <span>
                {capture === "recording"
                  ? "Listening… release to transcribe"
                  : capture === "transcribing"
                    ? "Transcribing…"
                    : notice}
              </span>
            </div>
          )}

          {/* Composer */}
          <div className="px-2 pb-2 pt-1">
            <div className="flex flex-col rounded-2xl border border-border bg-background shadow-sm transition-colors focus-within:border-ring">
              <textarea
                ref={textareaRef}
                value={active.draft}
                onChange={(e) =>
                  dispatch({
                    kind: "draft",
                    clientId: active.clientId,
                    draft: e.target.value,
                  })
                }
                onKeyDown={onKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Speak with the hotkey, or type a prompt…"
                rows={1}
                className="max-h-[180px] w-full resize-none overflow-y-auto bg-transparent px-3 pt-2.5 pb-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-end px-2 pb-2">
                {activeRunning ? (
                  <button
                    type="button"
                    onClick={cancel}
                    title="Stop"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/80"
                  >
                    <span className="block h-2.5 w-2.5 rounded-[2px] bg-foreground" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={send}
                    disabled={!active.draft.trim()}
                    title="Send"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                      className="h-4 w-4"
                    >
                      <path
                        d="M8 13V3.5M8 3.5L3.75 7.75M8 3.5l4.25 4.25"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const glowKeyframes = `
  @keyframes glow-agent {
    0%, 100% { box-shadow: 0 0 6px 1px rgba(96,165,250,0.18), 0 0 12px 3px rgba(96,165,250,0.07); }
    50% { box-shadow: 0 0 10px 2px rgba(96,165,250,0.30), 0 0 18px 5px rgba(96,165,250,0.12); }
  }
  .glow-agent-busy { animation: glow-agent 1.6s ease-in-out infinite; }
`;
