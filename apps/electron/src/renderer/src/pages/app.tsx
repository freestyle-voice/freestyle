import { Orb } from "@renderer/components/ui/orb";
import { getApiBase } from "@renderer/lib/api";
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
  color: "#a1a1aa",
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
// Sound system — single persistent AudioContext, avoids creating a new one
// per tone.
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

export default function AppPage(): React.JSX.Element {
  const [state, setState] = useState<PillState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("");
  const [partialText, setPartialText] = useState("");
  const [useStreaming, setUseStreaming] = useState(false);

  const recorderRef = useRef(new Recorder());
  const streamerRef = useRef<Streamer | null>(null);
  const analyserCtxRef = useRef<AudioContext | null>(null);
  const barsRef = useRef<number[]>(new Array(BARS).fill(0));
  const barsSvgRef = useRef<SVGSVGElement>(null);
  const volumeRef = useRef(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const timerRef = useRef<number>(0);
  const wantsMicRef = useRef(false);
  const appContextRef = useRef<string | null>(null);
  const micWarmedUp = useRef(false);

  const getInputVolume = useCallback(() => volumeRef.current, []);

  // -- Lazy singleton Streamer --
  const getStreamer = useCallback((): Streamer => {
    if (!streamerRef.current) {
      streamerRef.current = new Streamer(getApiBase(), {
        onConfig: (config) => {
          setUseStreaming(config.streaming);
        },
        onReady: () => {},
        onPartial: (text) => setPartialText(text),
        onFinal: async (text) => {
          recorderRef.current.cancel();
          if (text.trim()) {
            await window.api.pasteText(text);
          }
          hidePill();
        },
        onError: (msg) => {
          recorderRef.current.cancel();
          setState("error");
          setMessage(msg);
          setTimeout(() => hidePill(), 2000);
        },
      });
    }
    return streamerRef.current;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Audio visualization (from a MediaStream) --
  const startVisualization = useCallback((stream: MediaStream) => {
    if (!analyserCtxRef.current || analyserCtxRef.current.state === "closed") {
      analyserCtxRef.current = new AudioContext();
    }
    const ctx = analyserCtxRef.current;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const sliceSize = Math.floor(analyser.frequencyBinCount / BARS);

    const update = () => {
      if (!wantsMicRef.current) {
        source.disconnect();
        return;
      }
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
      volumeRef.current = Math.min(1, (totalSum / BARS) * 2.5);
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
    cancelAnimationFrame(timerRef.current);
    timerRef.current = 0;
    // Don't close analyserCtxRef — we reuse it across sessions
    barsRef.current = new Array(BARS).fill(0);
    volumeRef.current = 0;
    setElapsed(0);
  }, []);

  // Hide the pill and reset to idle so the next show starts clean
  const hidePill = useCallback(() => {
    setState("idle");
    setPartialText("");
    setMessage("");
    window.api.hidePill();
  }, []);

  // -- Start recording --
  const startRecording = useCallback(async () => {
    if (wantsMicRef.current) return;
    wantsMicRef.current = true;
    setMessage("");
    setPartialText("");

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

    const isFirstPress = !micWarmedUp.current;
    if (isFirstPress) {
      setState("initializing");
    } else {
      setState("recording");
      playTone("start");
    }

    try {
      const stream = await recorderRef.current.start();

      if (!wantsMicRef.current) {
        recorderRef.current.cancel();
        return;
      }

      if (isFirstPress) {
        micWarmedUp.current = true;
        playTone("start");
        setState("recording");
      }

      // Start timer
      startTimeRef.current = Date.now();
      const updateTimer = () => {
        if (!wantsMicRef.current) return;
        setElapsed(Date.now() - startTimeRef.current);
        timerRef.current = requestAnimationFrame(updateTimer);
      };
      timerRef.current = requestAnimationFrame(updateTimer);

      startVisualization(stream);

      try {
        await getStreamer().startCapture(
          stream,
          analyserCtxRef.current ?? undefined,
        );
      } catch {}
    } catch (err) {
      wantsMicRef.current = false;
      setState("error");
      setMessage(err instanceof Error ? err.message : "Mic access denied");
      setTimeout(() => hidePill(), 2000);
    }
  }, [startVisualization, hidePill, getStreamer]);

  // -- Commit: stop recording and transcribe --
  const commitRecording = useCallback(async () => {
    wantsMicRef.current = false;
    stopVisualization();
    playTone("stop");

    const recordingDuration = Date.now() - startTimeRef.current;
    if (recordingDuration < 1000) {
      recorderRef.current.cancel();
      streamerRef.current?.cancel();
      hidePill();
      return;
    }

    // If streaming mode is active, commit via WebSocket
    if (useStreaming && streamerRef.current) {
      setState("transcribing");
      recorderRef.current.cancel();
      streamerRef.current.commit();
      return;
    }

    // REST fallback: stop recorder, send WAV
    setState("transcribing");
    streamerRef.current?.cancel();

    try {
      let wavBlob: Blob;
      if (recorderRef.current.isRecording()) {
        wavBlob = await recorderRef.current.stop();
      } else {
        hidePill();
        return;
      }

      const headers: Record<string, string> = {
        "Content-Type": "audio/wav",
      };
      if (appContextRef.current)
        headers["x-app-context"] = appContextRef.current;

      const res = await fetch(`${getApiBase()}/api/transcribe`, {
        method: "POST",
        body: wavBlob,
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = data.cleaned || data.raw || "";

      if (text.trim()) {
        await window.api.pasteText(text);
      }
      hidePill();
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Transcription failed");
      setTimeout(() => hidePill(), 2000);
    }
  }, [useStreaming, stopVisualization, hidePill]);

  const cancelRecording = useCallback(() => {
    wantsMicRef.current = false;
    stopVisualization();
    streamerRef.current?.cancel();
    recorderRef.current.cancel();
    hidePill();
  }, [stopVisualization, hidePill]);

  // Load sound preference from server settings
  useEffect(() => {
    window.api
      ?.getServerPort()
      .then((port) =>
        fetch(`http://localhost:${port}/api/settings/sound_enabled`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.value === "false") _soundEnabled = false;
          }),
      )
      .catch(() => {});
  }, []);

  // Track state in a ref so event handlers don't need state in their deps
  const stateRef = useRef(state);
  stateRef.current = state;

  // Hold-to-record: hotkey down = start, hotkey up = commit
  useEffect(() => {
    const removeDown = window.api.onHotkeyDown(() => {
      const s = stateRef.current;
      if (s === "idle" || s === "transcribing" || s === "error") {
        startRecording();
      }
    });
    const removeUp = window.api.onHotkeyUp(() => {
      if (
        stateRef.current === "recording" ||
        stateRef.current === "initializing"
      ) {
        commitRecording();
      }
    });
    return () => {
      removeDown();
      removeUp();
    };
  }, [startRecording, commitRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRecording();
      streamerRef.current?.destroy();
      streamerRef.current = null;
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
          .glow-idle { box-shadow: 0 0 6px 2px rgba(161,161,170,0.05); transition: box-shadow 300ms ease; }
        `}
      </style>
      <div
        className={glowState}
        style={{
          borderRadius: 28,
          visibility: state === "idle" ? "hidden" : "visible",
        }}
      >
        <div
          className="inline-flex items-center gap-3"
          style={
            {
              height: 48,
              padding: "0 10px",
              borderRadius: 28,
              background: "#27272a",
              color: "#fafafa",
              border: "1px solid rgba(161,161,170,0.15)",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              fontWeight: 500,
              minWidth: 200,
              maxWidth: 420,
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties
          }
        >
          {/* Orb — conditionally rendered per state */}
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

          {/* Right-side content changes per state */}
          {state === "initializing" && (
            <span style={pillTextStyle}>
              <span style={{ opacity: 0.7 }}>Listening...</span>
            </span>
          )}

          {state === "recording" && (
            <>
              {partialText ? (
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: "#d4d4d8",
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
                        stroke="#a1a1aa"
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
                  color: "#a1a1aa",
                  paddingRight: 6,
                }}
              >
                {formatTimer(elapsed)}
              </span>
            </>
          )}

          {state === "transcribing" && (
            <span style={pillTextStyle}>
              {partialText ? partialText.slice(-30) : "Transcribing..."}
            </span>
          )}

          {state === "error" && (
            <span style={pillTextStyle}>{message || "Error"}</span>
          )}
        </div>
      </div>
    </div>
  );
}
