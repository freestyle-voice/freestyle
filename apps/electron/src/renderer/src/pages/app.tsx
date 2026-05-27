import { Orb } from "@renderer/components/ui/orb";
import { getApiBase, getClient } from "@renderer/lib/api";
import { Recorder } from "@renderer/lib/recorder";
import { Streamer } from "@renderer/lib/streamer";
import { useCallback, useEffect, useRef, useState } from "react";

const BARS = 14;
const RISE = 0.55;
const FALL = 0.22;
const SVG_WIDTH = 140;
const SVG_HEIGHT = 28;

const pillTextStyle: React.CSSProperties = {
  color: "var(--muted-foreground)",
  fontSize: 13,
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  paddingRight: 8,
};

type PillState =
  | "idle"
  | "initializing"
  | "recording"
  | "transcribing"
  | "error";

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

let _soundEnabled = true;
let _toneCtx: AudioContext | null = null;

function getToneCtx(): AudioContext {
  if (!_toneCtx || _toneCtx.state === "closed") _toneCtx = new AudioContext();
  return _toneCtx;
}

type TonePreset = "start" | "stop";
const TONE_PRESETS: Record<TonePreset, { freq: number; ms: number }> = {
  start: { freq: 880, ms: 100 },
  stop: { freq: 660, ms: 100 },
};

async function playTone(preset: TonePreset, volume = 0.3): Promise<void> {
  if (!_soundEnabled) return;
  const { freq, ms } = TONE_PRESETS[preset];
  try {
    const ctx = getToneCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
  } catch {}
}

function smoothBars(prev: number[], next: number[]): number[] {
  return prev.map((p, i) => {
    const n = next[i] ?? 0;
    const k = n > p ? RISE : FALL;
    return p + (n - p) * k;
  });
}

function formatTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function dbg(msg: string): void {
  window.api.debugLog(msg);
}

const pillInnerStyle: React.CSSProperties = {
  height: 48,
  padding: "0 10px",
  borderRadius: 28,
  background: "var(--card)",
  color: "var(--foreground)",
  border: "1px solid var(--border)",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  fontWeight: 500,
  minWidth: 200,
  maxWidth: 420,
  WebkitAppRegion: "no-drag",
} as React.CSSProperties;

// ---------------------------------------------------------------------------
// Transcription queue entry.  Each recording produces one of these.
// The `promise` resolves with the transcribed (and individually
// post-processed) text once the server responds.
// ---------------------------------------------------------------------------
interface QueueEntry {
  promise: Promise<string>;
}

export default function AppPage(): React.JSX.Element {
  const [state, setState] = useState<PillState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("");
  const [partialText, setPartialText] = useState("");
  const useStreamingRef = useRef(false);

  const [isReRecording, setIsReRecording] = useState(false);
  const isReRecordingRef = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);

  const recorderRef = useRef(new Recorder());
  const streamerRef = useRef<Streamer | null>(null);
  const analyserCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const barsRef = useRef<number[]>(new Array(BARS).fill(0));
  const barsSvgRef = useRef<SVGSVGElement>(null);
  const volumeRef = useRef(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const timerRef = useRef<number>(0);
  const wantsMicRef = useRef(false);
  const appContextRef = useRef<string | null>(null);
  const pendingCommitRef = useRef(false);
  const pillActiveRef = useRef(false);

  // ---- Transcription queue ----
  // Each commitRecording pushes a QueueEntry.  The drainQueue function
  // waits for all entries, stitches the results, post-processes if
  // needed, then pastes.  No session-id coordination required.
  const queueRef = useRef<QueueEntry[]>([]);
  const drainingRef = useRef(false);
  const cancelledRef = useRef(false);

  const getInputVolume = useCallback(() => volumeRef.current, []);

  // ---- Queue drain ----
  // Called after each commit.  Waits until the user stops recording
  // (wantsMicRef is false), then resolves all queued promises,
  // stitches results, post-processes if needed, and pastes.
  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;

    // Wait until the user finishes recording.  Each commitRecording
    // calls drainQueue again after pushing, so if we're already
    // draining we just return (the loop will pick up new entries).
    while (wantsMicRef.current && !cancelledRef.current) {
      await new Promise((r) => setTimeout(r, 100));
    }

    if (cancelledRef.current || queueRef.current.length === 0) {
      drainingRef.current = false;
      return;
    }

    // Take everything in the queue.
    const batch = [...queueRef.current];
    queueRef.current = [];

    dbg(`[drainQueue] waiting for ${batch.length} result(s)`);
    const results = await Promise.all(batch.map((e) => e.promise));

    if (cancelledRef.current) {
      drainingRef.current = false;
      return;
    }

    // If the user started recording again while we were awaiting,
    // put results back and loop.
    if (wantsMicRef.current || queueRef.current.length > 0) {
      const resolved = results
        .filter((t) => t.trim())
        .map((t) => ({ promise: Promise.resolve(t) }));
      queueRef.current = [...resolved, ...queueRef.current];
      drainingRef.current = false;
      // The next commitRecording will call drainQueue again.
      return;
    }

    // All results are in and user is not recording.  Stitch and
    // post-process as one cohesive piece.
    const nonEmpty = results.filter((t) => t.trim());
    if (nonEmpty.length === 0) {
      drainingRef.current = false;
      hidePill();
      return;
    }

    const combined = nonEmpty.join(" ");
    dbg(
      `[drainQueue] post-processing ${nonEmpty.length} result(s) via /api/post-process`,
    );
    let finalText: string;
    try {
      const res = await fetch(`${getApiBase()}/api/post-process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: combined,
          appContext: appContextRef.current,
        }),
      });
      if (cancelledRef.current) {
        drainingRef.current = false;
        return;
      }
      if (res.ok) {
        const data = await res.json();
        finalText = data.cleaned || combined;
      } else {
        finalText = combined;
      }
    } catch {
      finalText = combined;
    }

    if (cancelledRef.current) {
      drainingRef.current = false;
      return;
    }

    // If the user started ANOTHER recording while we were post-
    // processing, stash the result and let the next drain combine it.
    if (wantsMicRef.current || queueRef.current.length > 0) {
      queueRef.current = [
        { promise: Promise.resolve(finalText) },
        ...queueRef.current,
      ];
      drainingRef.current = false;
      return;
    }

    dbg(`[drainQueue] pasting (${finalText.length} chars)`);
    await window.api.pasteText(finalText);
    window.api?.sendTranscriptionDone();

    drainingRef.current = false;

    // Final check: if user started recording during paste, don't hide.
    if (
      !wantsMicRef.current &&
      queueRef.current.length === 0 &&
      !cancelledRef.current
    ) {
      dbg("[drainQueue] done, hiding pill");
      hidePill();
    }
  }, []);

  // ---- Streamer (lazy singleton) ----
  // biome-ignore lint/correctness/useExhaustiveDependencies: singleton
  const getStreamer = useCallback((): Streamer => {
    if (!streamerRef.current) {
      streamerRef.current = new Streamer(getApiBase(), {
        onConfig: (config) => {
          useStreamingRef.current = config.streaming;
        },
        onReady: () => {},
        onPartial: (text) => setPartialText(text),
        onFinal: async (_text) => {
          dbg(`[onFinal] active=${pillActiveRef.current}`);
          // Streaming onFinal is not used in the queue model for the
          // REST path.  For streaming mode it would need to resolve a
          // promise — but the current user is on REST, so this is a
          // no-op safety net.  The queue handles everything.
        },
        onCleaned: (_text) => {
          dbg(`[onCleaned] active=${pillActiveRef.current}`);
          // Cleaned results are handled by the transcribe endpoint
          // response directly.  No action needed here.
        },
        onError: (msg) => {
          dbg(`[onError] msg=${msg}, active=${pillActiveRef.current}`);
          if (!pillActiveRef.current) return;
          if (wantsMicRef.current) return;
          setState("error");
          setMessage(msg);
          setTimeout(() => hidePill(), 2000);
        },
      });
    }
    return streamerRef.current;
  }, []);

  // ---- Visualization ----
  const startVisualization = useCallback((stream: MediaStream) => {
    if (!analyserCtxRef.current || analyserCtxRef.current.state === "closed") {
      analyserCtxRef.current = new AudioContext();
    }
    const ctx = analyserCtxRef.current;
    try {
      audioSourceRef.current?.disconnect();
    } catch {}
    try {
      analyserNodeRef.current?.disconnect();
    } catch {}

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    audioSourceRef.current = source;
    analyserNodeRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const sliceSize = Math.floor(analyser.frequencyBinCount / BARS);
    let lastIpcTime = 0;

    const update = () => {
      if (!wantsMicRef.current) return;
      analyser.getByteFrequencyData(dataArray);
      const raw: number[] = [];
      let totalSum = 0;
      for (let i = 0; i < BARS; i++) {
        let sum = 0;
        for (let j = 0; j < sliceSize; j++) sum += dataArray[i * sliceSize + j];
        const val = sum / sliceSize / 255;
        raw.push(val);
        totalSum += val;
      }
      barsRef.current = smoothBars(barsRef.current, raw);
      const volume = Math.min(1, (totalSum / BARS) * 2.5);
      volumeRef.current = volume;
      const now = performance.now();
      if (now - lastIpcTime >= 100) {
        lastIpcTime = now;
        window.api?.sendAudioLevel(volume);
      }
      const svg = barsSvgRef.current;
      if (svg) {
        const lines = svg.querySelectorAll("line");
        for (let i = 0; i < lines.length; i++) {
          const val = barsRef.current[i] ?? 0;
          const h = Math.max(2, val * SVG_HEIGHT * 1.25);
          lines[i].setAttribute("y1", String((SVG_HEIGHT + h) / 2));
          lines[i].setAttribute("y2", String((SVG_HEIGHT - h) / 2));
          lines[i].style.opacity = String(0.5 + val * 0.5);
        }
      }
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
  }, []);

  const stopVisualization = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    clearInterval(timerRef.current);
    timerRef.current = 0;
    try {
      audioSourceRef.current?.disconnect();
    } catch {}
    try {
      analyserNodeRef.current?.disconnect();
    } catch {}
    audioSourceRef.current = null;
    analyserNodeRef.current = null;
    barsRef.current = new Array(BARS).fill(0);
    volumeRef.current = 0;
    setElapsed(0);
  }, []);

  // ---- Hide pill ----
  const hidePill = useCallback(() => {
    dbg("[hidePill]");
    setState("idle");
    setPartialText("");
    setMessage("");
    setIsReRecording(false);
    isReRecordingRef.current = false;
    setPendingCount(0);
    wantsMicRef.current = false;
    pillActiveRef.current = false;
    cancelledRef.current = false;
    queueRef.current = [];
    drainingRef.current = false;
    window.api.hidePill();
  }, []);

  // ---- Start recording ----
  const startRecording = useCallback(
    async (forReRecord = false) => {
      dbg(
        `[startRecording] forReRec=${forReRecord}, wantsMic=${wantsMicRef.current}`,
      );
      if (wantsMicRef.current) {
        dbg("[startRecording] SKIP: wantsMic already true");
        return;
      }
      wantsMicRef.current = true;
      pillActiveRef.current = true;
      cancelledRef.current = false;
      pendingCommitRef.current = false;
      setMessage("");
      setPartialText("");

      if (forReRecord) {
        isReRecordingRef.current = true;
        setIsReRecording(true);
      } else {
        isReRecordingRef.current = false;
        setIsReRecording(false);
      }

      window.api
        ?.getFrontmostApp()
        .then((app) => {
          appContextRef.current = app;
          if (app) {
            try {
              getStreamer().setContext(app);
            } catch {}
          }
        })
        .catch(() => {
          appContextRef.current = null;
        });

      if (!forReRecord) setState("initializing");

      try {
        const stream = useStreamingRef.current
          ? await recorderRef.current.acquireStream()
          : await recorderRef.current.start();

        if (!wantsMicRef.current) {
          recorderRef.current.cancel();
          recorderRef.current.releaseStream();
          return;
        }
        if (pendingCommitRef.current) {
          pendingCommitRef.current = false;
          recorderRef.current.cancel();
          recorderRef.current.releaseStream();
          streamerRef.current?.cancel();
          if (!forReRecord) hidePill();
          return;
        }

        playTone("start");
        setState("recording");
        startTimeRef.current = Date.now();
        timerRef.current = window.setInterval(() => {
          if (!wantsMicRef.current) return;
          setElapsed(Date.now() - startTimeRef.current);
        }, 100);

        startVisualization(stream);
        try {
          await getStreamer().startCapture(
            stream,
            analyserCtxRef.current ?? undefined,
          );
        } catch {}
      } catch (err) {
        wantsMicRef.current = false;
        pendingCommitRef.current = false;
        isReRecordingRef.current = false;
        setIsReRecording(false);
        recorderRef.current.releaseStream();
        setState("error");
        setMessage(err instanceof Error ? err.message : "Mic access denied");
        setTimeout(() => hidePill(), 2000);
      }
    },
    [startVisualization, hidePill, getStreamer],
  );

  // ---- Commit recording ----
  // Fires a transcription request and pushes the result promise into the
  // queue.  Does NOT paste or hide — the queue drain handles that.
  const commitRecording = useCallback(async () => {
    dbg(
      `[commitRecording] wantsMic=${wantsMicRef.current}, queueLen=${queueRef.current.length}`,
    );
    wantsMicRef.current = false;
    isReRecordingRef.current = false;
    setIsReRecording(false);
    stopVisualization();
    playTone("stop");

    const recordingDuration = Date.now() - startTimeRef.current;
    if (recordingDuration < 1000) {
      dbg("[commitRecording] short (<1s), skipping");
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();
      streamerRef.current?.cancel();
      // Only hide if nothing else is in-flight (no queue entries and
      // no active drain processing previous results).
      if (queueRef.current.length === 0 && !drainingRef.current) {
        hidePill();
      } else {
        // Go back to transcribing — the drain will handle paste/hide.
        setState("transcribing");
      }
      return;
    }

    setState("transcribing");

    // Get the audio blob
    let wavBlob: Blob | null = streamerRef.current?.getWavBlob() ?? null;
    if (!wavBlob && recorderRef.current.isRecording()) {
      wavBlob = await recorderRef.current.stop();
    }
    recorderRef.current.cancel();
    recorderRef.current.releaseStream();

    if (!wavBlob) {
      if (queueRef.current.length === 0) hidePill();
      return;
    }

    // Build the transcription promise
    const headers: Record<string, string> = {
      "Content-Type": "audio/wav",
      "x-audio-duration-ms": String(recordingDuration),
    };
    if (appContextRef.current) headers["x-app-context"] = appContextRef.current;

    setPendingCount((c) => c + 1);
    const transcribePromise = fetch(`${getApiBase()}/api/transcribe`, {
      method: "POST",
      body: wavBlob,
      headers,
    })
      .then(async (res) => {
        if (!res.ok) return "";
        const data = await res.json();
        return (data.raw || "").trim();
      })
      .catch(() => "")
      .finally(() => setPendingCount((c) => Math.max(0, c - 1)));

    // Push to queue
    queueRef.current.push({ promise: transcribePromise });
    dbg(`[commitRecording] pushed to queue, len=${queueRef.current.length}`);

    // Start draining if not already draining
    drainQueue();
  }, [stopVisualization, hidePill, drainQueue]);

  // ---- Cancel ----
  const cancelRecording = useCallback(() => {
    dbg("[cancelRecording]");
    cancelledRef.current = true;
    wantsMicRef.current = false;
    pillActiveRef.current = false;
    isReRecordingRef.current = false;
    setIsReRecording(false);
    queueRef.current = [];
    stopVisualization();
    streamerRef.current?.cancel();
    recorderRef.current.cancel();
    recorderRef.current.releaseStream();
    hidePill();
  }, [stopVisualization, hidePill]);

  // ---- Sound preference ----
  useEffect(() => {
    getClient()
      .api.settings[":key"].$get({ param: { key: "sound_enabled" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value === "false") _soundEnabled = false;
      })
      .catch(() => {});
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;

  // ---- Hotkey handlers ----
  useEffect(() => {
    const removeDown = window.api.onHotkeyDown(() => {
      const s = stateRef.current;
      dbg(`[hotkeyDown] state=${s}, wantsMic=${wantsMicRef.current}`);
      if (s === "idle" || s === "error") {
        startRecording(false);
      } else if (s === "transcribing") {
        startRecording(true);
      }
    });
    const removeUp = window.api.onHotkeyUp(() => {
      dbg(
        `[hotkeyUp] state=${stateRef.current}, wantsMic=${wantsMicRef.current}`,
      );
      if (stateRef.current === "recording") {
        commitRecording();
      } else if (stateRef.current === "initializing") {
        pendingCommitRef.current = true;
      }
    });
    const removeCancel = window.api.onPillCancel(() => {
      if (stateRef.current !== "idle") cancelRecording();
    });
    return () => {
      removeDown();
      removeUp();
      removeCancel();
    };
  }, [startRecording, commitRecording, cancelRecording]);

  // ---- Cleanup on unmount ----
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      setTimeout(() => {
        if (!mountedRef.current) {
          cancelRecording();
          recorderRef.current.destroy();
          streamerRef.current?.destroy();
          streamerRef.current = null;
        }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelRecording]);

  // ---- Render ----
  const gap = SVG_WIDTH / BARS;
  const barWidth = Math.min(gap * 0.55, 5);

  // Flare only on the topmost pill.
  const topGlow =
    state === "initializing"
      ? "glow-initializing"
      : state === "recording"
        ? "glow-recording"
        : state === "transcribing" && !isReRecording
          ? "glow-transcribing"
          : state === "error"
            ? "glow-error"
            : "glow-idle";

  // Right-side badge: timer during recording, xN during transcribing.
  const badge =
    state === "recording"
      ? formatTimer(elapsed)
      : state === "transcribing" && pendingCount > 0
        ? `x${pendingCount}`
        : null;

  return (
    <div
      className="flex h-screen w-screen items-center justify-center select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <style>
        {`
          @keyframes glow-pulse-amber {
            0%, 100% { box-shadow: 0 0 8px 2px rgba(251,191,36,0.12), 0 0 16px 4px rgba(251,191,36,0.05); }
            50% { box-shadow: 0 0 12px 3px rgba(251,191,36,0.22), 0 0 20px 5px rgba(251,191,36,0.09); }
          }
          @keyframes glow-pulse-green {
            0%, 100% { box-shadow: 0 0 8px 2px rgba(138,182,42,0.12), 0 0 16px 4px rgba(138,182,42,0.05); }
            50% { box-shadow: 0 0 12px 3px rgba(138,182,42,0.20), 0 0 20px 5px rgba(138,182,42,0.08); }
          }
          @keyframes glow-pulse-blue {
            0%, 100% { box-shadow: 0 0 8px 2px rgba(96,165,250,0.14), 0 0 16px 4px rgba(96,165,250,0.06); }
            50% { box-shadow: 0 0 12px 3px rgba(96,165,250,0.22), 0 0 20px 5px rgba(96,165,250,0.09); }
          }
          @keyframes glow-pulse-red {
            0%, 100% { box-shadow: 0 0 8px 2px rgba(221,110,78,0.12); }
            50% { box-shadow: 0 0 12px 3px rgba(221,110,78,0.20); }
          }
          .glow-initializing { animation: glow-pulse-amber 1s ease-in-out infinite; }
          .glow-recording { animation: glow-pulse-green 2s ease-in-out infinite; }
          .glow-transcribing { animation: glow-pulse-blue 1.5s ease-in-out infinite; }
          .glow-error { animation: glow-pulse-red 1.5s ease-in-out infinite; }
          .glow-idle { box-shadow: 0 0 6px 2px rgba(0,0,0,0.05); transition: box-shadow 300ms ease; }
          @keyframes shimmer {
            0% { background-position: 100% center; }
            100% { background-position: 0% center; }
          }
          .shimmer-text {
            font-style: italic;
            background: linear-gradient(90deg, var(--muted-foreground) calc(50% - 40px), var(--foreground), var(--muted-foreground) calc(50% + 40px));
            background-size: 250% 100%;
            background-clip: text;
            -webkit-background-clip: text;
            color: transparent;
            animation: shimmer 2s linear infinite;
          }
          @keyframes fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .pill-fade-in { animation: fade-in 200ms ease-out both; }
        `}
      </style>

      <div style={{ position: "relative" }}>
        {/* Background stacked pill — visible during re-record.
            No flare, slightly scaled down for depth effect. */}
        {isReRecording && (
          <div
            style={{
              borderRadius: 28,
              position: "absolute",
              bottom: -10,
              left: "50%",
              transform: "translateX(-50%) scale(0.97)",
              opacity: 0.45,
              pointerEvents: "none",
              zIndex: 0,
              width: "100%",
            }}
          >
            <div
              className="inline-flex items-center gap-3"
              style={pillInnerStyle}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <Orb
                  colors={["#60A5FA", "#3B82F6"]}
                  agentState="talking"
                  className="h-full w-full"
                />
              </div>
              <span style={pillTextStyle}>
                <span className="shimmer-text">Transcribing...</span>
              </span>
              {pendingCount > 0 && (
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    opacity: 0.6,
                    flexShrink: 0,
                    color: "var(--muted-foreground)",
                    paddingRight: 6,
                  }}
                >
                  x{pendingCount}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Primary (topmost) pill — gets the flare */}
        <div
          className={`${topGlow}${isReRecording ? " pill-fade-in" : ""}`}
          style={{
            borderRadius: 28,
            visibility: state === "idle" ? "hidden" : "visible",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            className="inline-flex items-center gap-3"
            style={pillInnerStyle}
          >
            {state !== "idle" && (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <Orb
                  colors={
                    state === "error"
                      ? ["#DD6E4E", "#B85C3A"]
                      : state === "transcribing"
                        ? ["#60A5FA", "#3B82F6"]
                        : state === "initializing"
                          ? ["#FBBF24", "#F59E0B"]
                          : ["#8AB62A", "#6B8F12"]
                  }
                  agentState={
                    state === "initializing"
                      ? "talking"
                      : state === "recording"
                        ? "listening"
                        : state === "transcribing"
                          ? "talking"
                          : null
                  }
                  getInputVolume={
                    state === "recording" ? getInputVolume : undefined
                  }
                  className="h-full w-full"
                />
              </div>
            )}

            {state === "initializing" && (
              <span style={pillTextStyle}>
                <span className="shimmer-text">Listening...</span>
              </span>
            )}

            {state === "recording" && (
              <>
                {partialText ? (
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      color: "var(--foreground)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      direction: "rtl",
                      textAlign: "left",
                    }}
                  >
                    {partialText}
                  </span>
                ) : (
                  <svg
                    ref={barsSvgRef}
                    width={SVG_WIDTH}
                    height={SVG_HEIGHT}
                    viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                    style={{ display: "block", flex: 1 }}
                    role="img"
                    aria-label="Audio levels"
                  >
                    {Array.from({ length: BARS }, (_, i) => {
                      const x = gap * (i + 0.5);
                      return (
                        <line
                          key={i}
                          x1={x}
                          y1={SVG_HEIGHT / 2 + 1}
                          x2={x}
                          y2={SVG_HEIGHT / 2 - 1}
                          stroke="var(--muted-foreground)"
                          strokeWidth={barWidth}
                          strokeLinecap="round"
                          style={{ opacity: 0.5 }}
                        />
                      );
                    })}
                  </svg>
                )}
              </>
            )}

            {state === "transcribing" && (
              <span style={pillTextStyle}>
                {partialText ? (
                  partialText.slice(-30)
                ) : (
                  <span className="shimmer-text">Transcribing...</span>
                )}
              </span>
            )}

            {state === "error" && (
              <span style={pillTextStyle}>{message || "Error"}</span>
            )}

            {/* Right-side badge: timer or xN counter */}
            {badge && (
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  opacity: 0.6,
                  flexShrink: 0,
                  color: "var(--muted-foreground)",
                  paddingRight: 6,
                }}
              >
                {badge}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
