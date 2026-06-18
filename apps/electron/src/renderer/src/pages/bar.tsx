import type {
  AgentConversation,
  AgentEvent,
  AgentUsage,
} from "@freestyle/validations";
import { useMultibandVolume } from "@renderer/components/ui/bar-visualizer";
import { Markdown } from "@renderer/components/ui/markdown";
import { Orb } from "@renderer/components/ui/orb";
import { VoicePill } from "@renderer/components/ui/voice-pill";
import { getApiBase, getAuthHeaders, refreshApiBase } from "@renderer/lib/api";
import { Recorder } from "@renderer/lib/recorder";
import { useCallback, useEffect, useRef, useState } from "react";

type CaptureState = "idle" | "recording" | "transcribing";
type RunStatus =
  | "idle"
  | "starting"
  | "running"
  | "done"
  | "error"
  | "canceled";

interface Item {
  id: string;
  role: "user" | "assistant" | "tool" | "error";
  text: string;
}

const MIN_RECORDING_MS = 400;

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

  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const [input, setInput] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [capture, setCapture] = useState<CaptureState>("idle");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [usage, setUsage] = useState<AgentUsage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [focused, setFocused] = useState(false);

  const recorderRef = useRef(new Recorder());
  const captureRef = useRef<CaptureState>("idle");
  const startTimeRef = useRef(0);
  const itemSeq = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedRef = useRef(false);
  // Set when a transcript lands while collapsed: focus the input once the
  // panel finishes mounting after the reveal.
  const pendingFocusRef = useRef(false);

  const running = runStatus === "starting" || runStatus === "running";
  const busy = running || capture !== "idle";

  const setCaptureState = useCallback((next: CaptureState) => {
    captureRef.current = next;
    setCapture(next);
  }, []);

  // ---- Conversation list ----
  const refreshConversations = useCallback(() => {
    window.api.agent
      .listConversations()
      .then(setConversations)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // ---- Expand/collapse is owned by main (cursor-driven). The bar only
  // reflects the state main pushes, and reports when it's "busy" (recording or
  // editing) so main won't auto-collapse mid-record or mid-edit. ----
  useEffect(() => {
    const off = window.api.agent.onSetExpanded((next) => {
      setExpanded(next);
      expandedRef.current = next;
      if (!next) setListOpen(false);
      // Focus the input as soon as the panel mounts after a reveal.
      if (next && pendingFocusRef.current) {
        pendingFocusRef.current = false;
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    });
    return off;
  }, []);

  useEffect(() => {
    const busy = capture !== "idle" || (focused && input.trim().length > 0);
    window.api.agent.setComposing(busy);
  }, [capture, focused, input]);

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
      // Land in the editable input — never auto-send.
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
      // Now reveal the full bar so the user can edit the query. While recording
      // we stay in the slim pill; the panel only opens once there's text.
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

  // ---- Transcript helpers ----
  const pushItem = useCallback((role: Item["role"], text: string) => {
    itemSeq.current += 1;
    setItems((prev) => [...prev, { id: `i${itemSeq.current}`, role, text }]);
  }, []);

  // ---- Agent run ----
  const send = useCallback(() => {
    const prompt = input.trim();
    if (!prompt || running) return;
    pushItem("user", prompt); // show the sent message
    setInput(""); // clear the input
    setUsage(null);
    setNotice(null);
    setRunStatus("starting");
    window.api.agent
      .start({ prompt, resume: activeId ?? undefined })
      .then((r) => {
        if (!r.ok) {
          setRunStatus("error");
          setNotice(r.error ?? "Failed to start agent.");
        }
      })
      .catch(() => setRunStatus("error"));
  }, [input, running, activeId, pushItem]);

  const cancel = useCallback(() => window.api.agent.cancel(), []);

  const newConversation = useCallback(() => {
    setActiveId(null);
    setItems([]);
    setUsage(null);
    setRunStatus("idle");
    setListOpen(false);
    textareaRef.current?.focus();
  }, []);

  const loadConversation = useCallback((id: string) => {
    setListOpen(false);
    setActiveId(id);
    setUsage(null);
    setRunStatus("idle");
    window.api.agent
      .getConversation(id)
      .then((msgs) => {
        itemSeq.current += 1;
        setItems(
          msgs.map((m, i) => ({
            id: `h${itemSeq.current}_${i}`,
            role: m.role,
            text: m.text,
          })),
        );
      })
      .catch(() => {});
  }, []);

  // ---- IPC wiring (set up once; handlers read refs/stable callbacks) ----
  useEffect(() => {
    const offDown = window.api.agent.onHotkeyDown(() => void startCapture());
    const offUp = window.api.agent.onHotkeyUp(() => void stopCapture());
    const offEvent = window.api.agent.onEvent((event: AgentEvent) => {
      switch (event.type) {
        case "status":
          setRunStatus(event.status);
          if (event.status === "done" || event.status === "error") {
            refreshConversations();
          }
          break;
        case "session_info":
          setActiveId(event.sessionId); // capture the live session id
          break;
        case "assistant_text":
          pushItem("assistant", event.text);
          break;
        case "tool_use":
          pushItem("tool", `${event.name}(${JSON.stringify(event.input)})`);
          break;
        case "result":
          setUsage(event.usage);
          break;
        case "error":
          pushItem("error", event.message);
          break;
      }
    });
    return () => {
      offDown();
      offUp();
      offEvent();
    };
  }, [startCapture, stopCapture, pushItem, refreshConversations]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on stream updates and on open
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items, usage, expanded]);

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

  const statusDot = running
    ? "bg-blue-400 animate-pulse"
    : runStatus === "error"
      ? "bg-red-400"
      : runStatus === "done"
        ? "bg-emerald-400"
        : "bg-muted-foreground/40";

  // ---- Collapsed ----
  if (!expanded) {
    // While capturing voice, show the exact Freestyle dictation pill.
    if (capture !== "idle") {
      return (
        <VoicePill
          state={capture === "recording" ? "recording" : "transcribing"}
          stream={micStream}
          draggable={false}
          align="center"
        />
      );
    }
    // Otherwise, the slim always-on strip.
    return (
      <div
        className="flex h-screen w-screen items-center justify-center"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        <style>{glowKeyframes}</style>
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
            {running ? "Working…" : "Claude Code"}
          </span>
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
        </div>
      </div>
    );
  }

  // ---- Expanded panel ----
  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{glowKeyframes}</style>

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="h-5 w-5 overflow-hidden rounded-full">
          <Orb
            colors={orbColors}
            agentState={orbState}
            className="h-full w-full"
          />
        </div>
        <button
          type="button"
          onClick={() => setListOpen((v) => !v)}
          className="flex items-center gap-1 text-sm font-semibold hover:text-foreground"
        >
          <span className="max-w-[180px] truncate">
            {activeId
              ? (conversations.find((c) => c.id === activeId)?.title ??
                "Conversation")
              : "New conversation"}
          </span>
          <span className="text-muted-foreground text-xs">⌄</span>
        </button>
        <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={newConversation}
            title="New conversation"
            className="rounded px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            +
          </button>
        </div>
      </div>

      {/* Conversation list overlay */}
      {listOpen && (
        <div className="absolute inset-x-2 top-12 z-10 max-h-72 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl">
          <button
            type="button"
            onClick={newConversation}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            <span className="text-muted-foreground">+</span> New conversation
          </button>
          {conversations.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              No past conversations yet.
            </p>
          )}
          {conversations.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => loadConversation(c.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted ${
                c.id === activeId ? "bg-muted" : ""
              }`}
            >
              <span className="flex-1 truncate">{c.title}</span>
              <span className="text-[10px] text-muted-foreground">
                {relativeTime(c.updatedAt)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 text-sm">
        {items.length === 0 && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Hold the agent hotkey and speak, edit, then press Enter to run.
          </p>
        )}
        {items.map((item) => (
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
            {item.role === "error" && (
              <div className="text-red-400">⚠ {item.text}</div>
            )}
          </div>
        ))}
        {running && (
          <p className="text-xs text-muted-foreground animate-pulse">
            {runStatus === "starting" ? "Starting…" : "Working…"}
          </p>
        )}
        {usage && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            {usage.inputTokens}↓ {usage.outputTokens}↑ tokens
            {typeof usage.costUsd === "number"
              ? ` · $${usage.costUsd.toFixed(4)}`
              : ""}
            {runStatus === "canceled" ? " · canceled" : ""}
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

      {/* Input */}
      <div className="border-t border-border p-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Speak with the hotkey, or type a prompt…"
          rows={2}
          className="w-full resize-none rounded-lg bg-background px-2.5 py-1.5 text-sm text-foreground outline-none border border-border focus:border-ring"
        />
        <div className="mt-1.5 flex items-center justify-end gap-2">
          {running ? (
            <button
              type="button"
              onClick={cancel}
              className="rounded-lg bg-muted px-3 py-1 text-xs hover:bg-muted/80"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!input.trim()}
              className="rounded-lg bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-40"
            >
              Send
            </button>
          )}
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
