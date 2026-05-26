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

/** Shared style for right-side text content in the pill */
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
// Sound system
// ---------------------------------------------------------------------------

let _soundEnabled = true;
let _toneCtx: AudioContext | null = null;

function getToneCtx(): AudioContext {
  if (!_toneCtx || _toneCtx.state === "closed") {
    _toneCtx = new AudioContext();
  }
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
  } catch {
    // ignore audio errors
  }
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

// ---------------------------------------------------------------------------
// Pill inner style — shared between primary and background pills.
// ---------------------------------------------------------------------------

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

export default function AppPage(): React.JSX.Element {
  const [state, setState] = useState<PillState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("");
  const [partialText, setPartialText] = useState("");
  const useStreamingRef = useRef(false);

  // Re-record state.
  //
  // `sessionIdRef` is the single source of truth for which commit "owns"
  // the current session.  Every `startRecording` increments it.  After an
  // async boundary (fetch, onFinal), a commit checks whether the session
  // is still the one it started — if not, it's been superseded and must
  // NOT paste or hide.  Instead it stores its result in `previousTextRef`
  // for the newer session to pick up.
  //
  // `commitSessionRef` records the sessionId that the currently in-flight
  // commit belongs to.  It's set at the start of commitRecording and
  // checked after every await.
  const [isReRecording, setIsReRecording] = useState(false);
  const isReRecordingRef = useRef(false);
  const previousTextRef = useRef<string | null>(null);
  const commitSessionRef = useRef(0);

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
  const sessionIdRef = useRef(0);

  const getInputVolume = useCallback(() => volumeRef.current, []);

  /** Returns true if `mySession` is still the active session. */
  const isCurrentSession = useCallback(
    (mySession: number) => sessionIdRef.current === mySession && mySession > 0,
    [],
  );

  // -- Lazy singleton Streamer --
  // biome-ignore lint/correctness/useExhaustiveDependencies: singleton must only be created once
  const getStreamer = useCallback((): Streamer => {
    if (!streamerRef.current) {
      streamerRef.current = new Streamer(getApiBase(), {
        onConfig: (config) => {
          useStreamingRef.current = config.streaming;
        },
        onReady: () => {},
        onPartial: (text) => setPartialText(text),
        onFinal: async (text) => {
          const sid = sessionIdRef.current;
          dbg(
            `[onFinal] text=${JSON.stringify(text?.slice(0, 50))}, sid=${sid}, commitSid=${commitSessionRef.current}, wantsMic=${wantsMicRef.current}`,
          );
          if (sid === 0) return;

          // If the user is still recording a re-record, just store.
          if (wantsMicRef.current) {
            dbg("[onFinal] → user still recording, storing");
            previousTextRef.current = text.trim() || null;
            return;
          }

          // If this result belongs to a superseded commit (a newer
          // session started since this commit was sent), store the
          // result for the newer session and don't paste/hide.
          if (
            commitSessionRef.current !== 0 &&
            sid !== commitSessionRef.current
          ) {
            dbg(
              `[onFinal] → superseded (commit owns ${commitSessionRef.current}), storing`,
            );
            previousTextRef.current = text.trim() || null;
            return;
          }

          // Normal path — this is the final result.
          dbg("[onFinal] → paste and hide");
          sessionIdRef.current = 0;
          commitSessionRef.current = 0;
          wantsMicRef.current = false;
          stopVisualization();
          recorderRef.current.cancel();
          recorderRef.current.releaseStream();
          if (text.trim()) {
            await window.api.pasteText(text);
            window.api?.sendTranscriptionDone();
          }
          hidePill();
        },
        onCleaned: (text) => {
          dbg(
            `[onCleaned] sid=${sessionIdRef.current}, wantsMic=${wantsMicRef.current}`,
          );
          if (sessionIdRef.current === 0) return;

          if (wantsMicRef.current) {
            if (text.trim()) previousTextRef.current = text.trim();
            return;
          }

          if (text.trim()) {
            window.api.pasteText(text);
          }
        },
        onError: (msg) => {
          dbg(
            `[onError] msg=${msg}, sid=${sessionIdRef.current}, wantsMic=${wantsMicRef.current}`,
          );
          if (sessionIdRef.current === 0) return;

          if (wantsMicRef.current) {
            previousTextRef.current = null;
            return;
          }

          sessionIdRef.current = 0;
          commitSessionRef.current = 0;
          wantsMicRef.current = false;
          stopVisualization();
          recorderRef.current.cancel();
          recorderRef.current.releaseStream();
          setState("error");
          setMessage(msg);
          setTimeout(() => hidePill(), 2000);
        },
      });
    }
    return streamerRef.current;
  }, []);

  // -- Audio visualization --
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
        for (let j = 0; j < sliceSize; j++) {
          sum += dataArray[i * sliceSize + j];
        }
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

  // Hide the pill and reset ALL state so the next show starts clean.
  const hidePill = useCallback(() => {
    dbg("[hidePill]");
    setState("idle");
    setPartialText("");
    setMessage("");
    setIsReRecording(false);
    isReRecordingRef.current = false;
    wantsMicRef.current = false;
    sessionIdRef.current = 0;
    commitSessionRef.current = 0;
    previousTextRef.current = null;
    window.api.hidePill();
  }, []);

  // -- Start recording --
  const startRecording = useCallback(
    async (forReRecord = false) => {
      dbg(
        `[startRecording] forReRecord=${forReRecord}, wantsMic=${wantsMicRef.current}, sid=${sessionIdRef.current}`,
      );
      if (wantsMicRef.current) {
        dbg("[startRecording] SKIP: wantsMic already true");
        return;
      }
      wantsMicRef.current = true;
      pendingCommitRef.current = false;
      setMessage("");
      setPartialText("");

      if (forReRecord) {
        isReRecordingRef.current = true;
        setIsReRecording(true);
      } else {
        isReRecordingRef.current = false;
        setIsReRecording(false);
        previousTextRef.current = null;
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

      if (!forReRecord) {
        setState("initializing");
      }

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

        sessionIdRef.current++;
        dbg(`[startRecording] session started: sid=${sessionIdRef.current}`);
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

  // -- Commit: stop recording and transcribe --
  const commitRecording = useCallback(async () => {
    const wasReRecording = isReRecordingRef.current;
    const mySession = sessionIdRef.current;
    commitSessionRef.current = mySession;

    dbg(
      `[commitRecording] wasReRec=${wasReRecording}, sid=${mySession}, wantsMic=${wantsMicRef.current}, hasPrevText=${!!previousTextRef.current}`,
    );

    wantsMicRef.current = false;
    isReRecordingRef.current = false;
    setIsReRecording(false);
    stopVisualization();
    playTone("stop");

    const recordingDuration = Date.now() - startTimeRef.current;
    if (recordingDuration < 1000) {
      dbg("[commitRecording] short (<1s)");
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();
      streamerRef.current?.cancel();
      if (wasReRecording && previousTextRef.current?.trim()) {
        const text = previousTextRef.current;
        previousTextRef.current = null;
        sessionIdRef.current = 0;
        commitSessionRef.current = 0;
        await window.api.pasteText(text);
        window.api?.sendTranscriptionDone();
      }
      hidePill();
      return;
    }

    const prevText = previousTextRef.current;
    previousTextRef.current = null;

    // --- Streaming path ---
    if (useStreamingRef.current && streamerRef.current) {
      setState("transcribing");
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();
      dbg(`[commitRecording] streaming commit, hasPrev=${!!prevText}`);
      streamerRef.current.commit(prevText ?? undefined);
      // onFinal will handle paste/hide, using sessionId checks.
      return;
    }

    // --- REST path ---
    setState("transcribing");
    streamerRef.current?.cancel();

    try {
      let wavBlob: Blob | null = streamerRef.current?.getWavBlob() ?? null;

      if (!wavBlob && recorderRef.current.isRecording()) {
        wavBlob = await recorderRef.current.stop();
      }

      if (!wavBlob) {
        recorderRef.current.releaseStream();
        if (prevText?.trim()) {
          sessionIdRef.current = 0;
          commitSessionRef.current = 0;
          await window.api.pasteText(prevText);
          window.api?.sendTranscriptionDone();
        }
        hidePill();
        return;
      }

      recorderRef.current.cancel();
      recorderRef.current.releaseStream();

      const headers: Record<string, string> = {
        "Content-Type": "audio/wav",
        "x-audio-duration-ms": String(recordingDuration),
      };
      if (appContextRef.current)
        headers["x-app-context"] = appContextRef.current;
      if (prevText) headers["x-previous-text"] = prevText;

      const res = await fetch(`${getApiBase()}/api/transcribe`, {
        method: "POST",
        body: wavBlob,
        headers,
      });

      // ---- After async: check if we're still the active session ----
      if (!isCurrentSession(mySession)) {
        // A newer session started while we were waiting for the API.
        // Store our result for the newer session to combine with.
        dbg(
          `[commitRecording] REST response arrived but superseded (my=${mySession}, current=${sessionIdRef.current})`,
        );
        if (res.ok) {
          try {
            const data = await res.json();
            const text = data.cleaned || data.raw || "";
            if (text.trim()) {
              previousTextRef.current = text.trim();
            }
          } catch {}
        }
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = data.cleaned || data.raw || "";
      if (import.meta.env.DEV) {
        dbg(
          `[commitRecording] REST response: ${JSON.stringify(text?.slice(0, 50))}`,
        );
      }

      sessionIdRef.current = 0;
      commitSessionRef.current = 0;
      if (text.trim()) {
        await window.api.pasteText(text);
        window.api?.sendTranscriptionDone();
      }
      hidePill();
    } catch (err) {
      // Only show error if we're still the active session
      if (isCurrentSession(mySession)) {
        setState("error");
        setMessage(err instanceof Error ? err.message : "Transcription failed");
        setTimeout(() => hidePill(), 2000);
      }
    }
  }, [stopVisualization, hidePill, isCurrentSession]);

  const cancelRecording = useCallback(() => {
    dbg("[cancelRecording]");
    wantsMicRef.current = false;
    sessionIdRef.current = 0;
    commitSessionRef.current = 0;
    isReRecordingRef.current = false;
    setIsReRecording(false);
    previousTextRef.current = null;
    stopVisualization();
    streamerRef.current?.cancel();
    recorderRef.current.cancel();
    recorderRef.current.releaseStream();
    hidePill();
  }, [stopVisualization, hidePill]);

  // Load sound preference
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

  // Hotkey handlers
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
      if (stateRef.current !== "idle") {
        cancelRecording();
      }
    });
    return () => {
      removeDown();
      removeUp();
      removeCancel();
    };
  }, [startRecording, commitRecording, cancelRecording]);

  // Cleanup on unmount
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

  // -- Render --
  const gap = SVG_WIDTH / BARS;
  const barWidth = Math.min(gap * 0.55, 5);

  const glowState =
    state === "initializing"
      ? "glow-initializing"
      : state === "recording"
        ? "glow-recording"
        : state === "transcribing"
          ? "glow-transcribing"
          : state === "error"
            ? "glow-error"
            : "glow-idle";

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
            background: linear-gradient(
              90deg,
              var(--muted-foreground) calc(50% - 40px),
              var(--foreground),
              var(--muted-foreground) calc(50% + 40px)
            );
            background-size: 250% 100%;
            background-clip: text;
            -webkit-background-clip: text;
            color: transparent;
            animation: shimmer 2s linear infinite;
          }
          @keyframes slide-up-in {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .pill-slide-up {
            animation: slide-up-in 250ms ease-out both;
          }
        `}
      </style>

      <div style={{ position: "relative" }}>
        {isReRecording && (
          <div
            className="glow-transcribing"
            style={{
              borderRadius: 28,
              position: "absolute",
              bottom: -14,
              left: 6,
              right: 6,
              opacity: 0.5,
              transform: "scale(0.92)",
              pointerEvents: "none",
              zIndex: 0,
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
            </div>
          </div>
        )}

        <div
          className={`${glowState}${isReRecording ? " pill-slide-up" : ""}`}
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
                  {formatTimer(elapsed)}
                </span>
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
          </div>
        </div>
      </div>
    </div>
  );
}
