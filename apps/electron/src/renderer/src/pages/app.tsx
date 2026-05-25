import { Orb } from "@renderer/components/ui/orb";
import { getApiBase } from "@renderer/lib/api";
import { Recorder } from "@renderer/lib/recorder";
import { Streamer } from "@renderer/lib/streamer";
import { Check, Mic } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const BARS = 14;
const RISE = 0.55;
const FALL = 0.22;

type PillState =
  | "idle"
  | "initializing"
  | "recording"
  | "transcribing"
  | "pasted"
  | "error";

// ---------------------------------------------------------------------------
// Sound system — generates short sine-wave tones via Web Audio API.
// Sounds can be muted globally via the `sound_enabled` setting.
// ---------------------------------------------------------------------------

let _soundEnabled = true; // cached; updated from settings on mount

type TonePreset = "start" | "stop" | "ready";
const TONE_PRESETS: Record<TonePreset, { freq: number; ms: number }> = {
  start: { freq: 880, ms: 100 },
  stop: { freq: 660, ms: 100 },
  ready: { freq: 600, ms: 80 },
};

function playTone(preset: TonePreset, volume = 0.15): void {
  if (!_soundEnabled) return;
  const { freq, ms } = TONE_PRESETS[preset];
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
    setTimeout(() => ctx.close(), ms + 100);
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
  const [bars, setBars] = useState<number[]>(() => new Array(BARS).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("");
  const [partialText, setPartialText] = useState("");
  const [useStreaming, setUseStreaming] = useState(false);

  const recorderRef = useRef(new Recorder());
  const streamerRef = useRef<Streamer | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const barsRef = useRef<number[]>(new Array(BARS).fill(0));
  const volumeRef = useRef(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const timerRef = useRef<number>(0);
  const wantsMicRef = useRef(false);
  const appContextRef = useRef<string | null>(null);

  const getInputVolume = useCallback(() => volumeRef.current, []);

  // -- Audio visualization (from a MediaStream) --
  const startVisualization = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const sliceSize = Math.floor(analyser.frequencyBinCount / BARS);

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
      setBars([...barsRef.current]);
      volumeRef.current = Math.min(1, (totalSum / BARS) * 2.5);
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
  }, []);

  const stopVisualization = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    cancelAnimationFrame(timerRef.current);
    timerRef.current = 0;
    if (ctxRef.current) {
      try {
        ctxRef.current.close();
      } catch (_) {
        /* ignore */
      }
      ctxRef.current = null;
    }
    setBars(new Array(BARS).fill(0));
    barsRef.current = new Array(BARS).fill(0);
    volumeRef.current = 0;
    setElapsed(0);
  }, []);

  // -- Start recording --
  const startRecording = useCallback(async () => {
    if (wantsMicRef.current) return; // Already recording
    wantsMicRef.current = true;
    setState("initializing");
    setMessage("");
    setPartialText("");

    // Capture frontmost app NOW (before mic dialog or any focus change)
    appContextRef.current =
      (await window.api?.getFrontmostApp().catch(() => null)) ?? null;

    try {
      // Start the recorder (captures audio for REST transcription)
      const stream = await recorderRef.current.start();

      if (!wantsMicRef.current) {
        recorderRef.current.cancel();
        return;
      }

      // Mic acquired — transition to recording and play feedback sound
      setState("recording");
      playTone("start");

      // Start timer
      startTimeRef.current = Date.now();
      const updateTimer = () => {
        if (!wantsMicRef.current) return;
        setElapsed(Date.now() - startTimeRef.current);
        timerRef.current = requestAnimationFrame(updateTimer);
      };
      timerRef.current = requestAnimationFrame(updateTimer);

      // Start visualization from the recorder's stream
      startVisualization(stream);

      // Try to also open a streaming connection for real-time partial text
      try {
        const streamer = new Streamer(getApiBase(), {
          onConfig: (config) => {
            setUseStreaming(config.streaming);
          },
          onReady: () => {},
          onPartial: (text) => setPartialText(text),
          onFinal: async (text) => {
            // Always clean up streamer and recorder after streaming completes
            streamerRef.current?.close();
            streamerRef.current = null;
            recorderRef.current.cancel();

            if (text.trim()) {
              await window.api.pasteText(text);
              setState("pasted");
              setMessage(text.length > 40 ? `${text.slice(0, 40)}...` : text);
              setTimeout(() => {
                setState("idle");
                setMessage("");
                setPartialText("");
              }, 1500);
            } else {
              setState("idle");
              setMessage("");
              setPartialText("");
            }
          },
          onError: (msg) => {
            // Clean up on streaming error
            streamerRef.current?.close();
            streamerRef.current = null;
            recorderRef.current.cancel();
            setState("error");
            setMessage(msg);
            setTimeout(() => {
              setState("idle");
              setMessage("");
            }, 2500);
          },
        });
        streamerRef.current = streamer;
        // Start the streamer's mic separately (it gets its own stream)
        await streamer.start();
      } catch {
        // Streaming is optional -- REST fallback always works
        // Close the streamer if it partially initialized (e.g. WebSocket opened but mic failed)
        streamerRef.current?.close();
        streamerRef.current = null;
      }
    } catch (err) {
      wantsMicRef.current = false;
      setState("error");
      setMessage(err instanceof Error ? err.message : "Mic access denied");
      setTimeout(() => setState("idle"), 2500);
    }
  }, [startVisualization]);

  // -- Commit: stop recording and transcribe --
  const commitRecording = useCallback(async () => {
    wantsMicRef.current = false;
    stopVisualization();
    // Audio feedback: descending tone on stop
    playTone("stop");

    // Skip recordings shorter than 1 second (likely accidental trigger)
    const recordingDuration = Date.now() - startTimeRef.current;
    if (recordingDuration < 1000) {
      recorderRef.current.cancel();
      streamerRef.current?.cancel();
      streamerRef.current = null;
      setState("idle");
      return;
    }

    const streamer = streamerRef.current;

    // If streaming mode is active, just commit via WebSocket
    if (useStreaming && streamer) {
      setState("transcribing");
      // Stop the recorder's mic stream (the streamer has its own)
      recorderRef.current.cancel();
      streamer.commit();
      // The onFinal callback will handle the paste and cleanup
      return;
    }

    // REST fallback: stop recorder, send WAV
    setState("transcribing");
    streamer?.close();
    streamerRef.current = null;

    try {
      let wavBlob: Blob;
      if (recorderRef.current.isRecording()) {
        wavBlob = await recorderRef.current.stop();
      } else {
        setState("idle");
        return;
      }

      // Use the frontmost app captured at recording start
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

      if (!text.trim()) {
        setState("idle");
        return;
      }

      await window.api.pasteText(text);
      setState("pasted");
      setMessage(text.length > 40 ? `${text.slice(0, 40)}...` : text);
      setTimeout(() => {
        setState("idle");
        setMessage("");
        setPartialText("");
      }, 1500);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Transcription failed");
      setTimeout(() => {
        setState("idle");
        setMessage("");
      }, 2500);
    }
  }, [useStreaming, stopVisualization]);

  const cancelRecording = useCallback(() => {
    wantsMicRef.current = false;
    stopVisualization();
    streamerRef.current?.cancel();
    streamerRef.current = null;
    recorderRef.current.cancel();
    setState("idle");
    setMessage("");
    setPartialText("");
  }, [stopVisualization]);

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

  // Hide the pill whenever we return to idle (covers all exit paths)
  const prevStateRef = useRef(state);
  useEffect(() => {
    if (state === "idle" && prevStateRef.current !== "idle") {
      window.api.hidePill();
    }
    prevStateRef.current = state;
  }, [state]);

  // Hold-to-record: hotkey down = start, hotkey up = commit
  useEffect(() => {
    const removeDown = window.api.onHotkeyDown(() => {
      if (stateRef.current === "idle") {
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelRecording]);

  // -- Render --
  const svgWidth = 140;
  const svgHeight = 28;
  const gap = svgWidth / BARS;
  const barWidth = Math.min(gap * 0.55, 5);

  // Animated glow uses CSS animation via a class
  const glowState =
    state === "initializing"
      ? "glow-initializing"
      : state === "recording"
        ? "glow-recording"
        : state === "transcribing"
          ? "glow-transcribing"
          : state === "pasted"
            ? "glow-pasted"
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
          .glow-pasted { box-shadow: 0 0 10px 3px rgba(138,182,42,0.12); transition: box-shadow 300ms ease; }
          .glow-error { animation: glow-pulse-red 1.5s ease-in-out infinite; }
          .glow-idle { box-shadow: 0 0 6px 2px rgba(161,161,170,0.05); transition: box-shadow 300ms ease; }
        `}
      </style>
      <div className={glowState} style={{ borderRadius: 28 }}>
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
          {/* Persistent orb — never unmounts, only props change */}
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
            <span
              style={{
                flex: 1,
                fontSize: 13,
                color: "#a1a1aa",
                whiteSpace: "nowrap",
              }}
            >
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
                  width={svgWidth}
                  height={svgHeight}
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  style={{ display: "block", flex: 1 }}
                  role="img"
                  aria-label="Audio levels"
                >
                  {bars.map((val, i) => {
                    const h = Math.max(2, val * svgHeight * 1.25);
                    const x = gap * (i + 0.5);
                    return (
                      <line
                        key={i}
                        x1={x}
                        y1={(svgHeight + h) / 2}
                        x2={x}
                        y2={(svgHeight - h) / 2}
                        stroke="#a1a1aa"
                        strokeWidth={barWidth}
                        strokeLinecap="round"
                        style={{ opacity: 0.5 + val * 0.5 }}
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
            <span
              style={{
                color: "#a1a1aa",
                fontSize: 13,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                paddingRight: 8,
              }}
            >
              {partialText ? partialText.slice(-30) : "Transcribing..."}
            </span>
          )}

          {state === "pasted" && (
            <span
              style={{
                color: "#a1a1aa",
                fontSize: 13,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                paddingRight: 8,
              }}
            >
              <Check
                size={14}
                style={{
                  color: "#8AB62A",
                  display: "inline",
                  verticalAlign: "middle",
                  marginRight: 4,
                }}
              />
              {message || "Pasted"}
            </span>
          )}

          {state === "error" && (
            <span
              style={{
                color: "#a1a1aa",
                fontSize: 13,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                paddingRight: 8,
              }}
            >
              {message || "Error"}
            </span>
          )}

          {state === "idle" && (
            <div
              className="inline-flex items-center gap-2"
              style={{ padding: "0 8px" }}
            >
              <Mic size={17} style={{ opacity: 0.5, color: "#a1a1aa" }} />
              <span style={{ opacity: 0.5, color: "#a1a1aa" }}>
                Hold hotkey to record
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
