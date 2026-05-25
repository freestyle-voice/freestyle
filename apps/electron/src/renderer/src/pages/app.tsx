import { Orb } from "@renderer/components/ui/orb";
import { getApiBase } from "@renderer/lib/api";
import { Recorder } from "@renderer/lib/recorder";
import { Streamer } from "@renderer/lib/streamer";
import { Check, Mic } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const BARS = 14;
const RISE = 0.55;
const FALL = 0.22;
const DISMISS_COLLAPSE_MS = 250; // phase 1: text fade + width collapse
const DISMISS_SHRINK_MS = 200; // phase 2: orb scale down + fade out
const DISMISS_MS = DISMISS_COLLAPSE_MS + DISMISS_SHRINK_MS; // total
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
  | "pasted"
  | "error";

// ---------------------------------------------------------------------------
// Sound system — generates short sine-wave tones via Web Audio API.
// Sounds can be muted globally via the `sound_enabled` setting.
// ---------------------------------------------------------------------------

let _soundEnabled = true; // cached; updated from settings on mount

type TonePreset = "start" | "stop";
const TONE_PRESETS: Record<TonePreset, { freq: number; ms: number }> = {
  start: { freq: 880, ms: 100 },
  stop: { freq: 660, ms: 100 },
};

async function playTone(preset: TonePreset, volume = 0.3): Promise<void> {
  if (!_soundEnabled) return;
  const { freq, ms } = TONE_PRESETS[preset];
  try {
    const ctx = new AudioContext();
    // Resume context in case Chromium's autoplay policy suspended it
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
    setTimeout(() => ctx.close(), ms + 200);
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
  const ctxRef = useRef<AudioContext | null>(null);
  const barsRef = useRef<number[]>(new Array(BARS).fill(0));
  const barsSvgRef = useRef<SVGSVGElement>(null);
  const volumeRef = useRef(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const timerRef = useRef<number>(0);
  const wantsMicRef = useRef(false);
  const appContextRef = useRef<string | null>(null);
  const micWarmedUp = useRef(false); // true after first successful getUserMedia
  const pillRef = useRef<HTMLDivElement>(null); // for dismiss animation DOM manipulation

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
      volumeRef.current = Math.min(1, (totalSum / BARS) * 2.5);
      // Direct DOM update — avoids 60fps React re-renders (rerender-use-ref-transient-values)
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
    if (ctxRef.current) {
      try {
        ctxRef.current.close();
      } catch (_) {
        /* ignore */
      }
      ctxRef.current = null;
    }
    barsRef.current = new Array(BARS).fill(0);
    volumeRef.current = 0;
    setElapsed(0);
  }, []);

  // Dismiss animation: shrink + fade the pill, then hide the window.
  // We do NOT change the pill state to "dismissing" — that would remove
  // the text content (pasted/error/etc) and cause a visual jump. Instead
  // we keep the current visual state and only apply an inline CSS
  // transform+opacity animation via the DOM ref.
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissRafRef = useRef(0);

  const dismissPill = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    cancelAnimationFrame(dismissRafRef.current);
    const el = pillRef.current;
    if (!el) {
      setState("idle");
      setMessage("");
      setPartialText("");
      return;
    }

    // -- Phase 1: fade out text content, collapse width to orb --
    // Set initial state (no transition yet)
    el.style.transition = "none";
    el.style.transform = "scale(1)";
    el.style.opacity = "1";
    el.style.minWidth = `${el.offsetWidth}px`; // lock current width

    // Fade out all children except the orb (first child)
    const children = el.children;
    for (let i = 1; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      child.style.transition = `opacity ${DISMISS_COLLAPSE_MS * 0.6}ms ease-out`;
      child.style.opacity = "1";
    }

    // Double-rAF to guarantee the 'from' frame is painted
    dismissRafRef.current = requestAnimationFrame(() => {
      dismissRafRef.current = requestAnimationFrame(() => {
        if (!pillRef.current) return;
        // Collapse: fade text, shrink width to orb size
        const pill = pillRef.current;
        pill.style.transition = `min-width ${DISMISS_COLLAPSE_MS}ms ease-in-out, padding ${DISMISS_COLLAPSE_MS}ms ease-in-out`;
        pill.style.minWidth = "52px"; // orb (32) + padding (20)
        pill.style.padding = "0 10px";
        for (let i = 1; i < children.length; i++) {
          (children[i] as HTMLElement).style.opacity = "0";
        }

        // -- Phase 2: after collapse, scale down + fade out --
        setTimeout(() => {
          if (!pillRef.current) return;
          pillRef.current.style.transition = `transform ${DISMISS_SHRINK_MS}ms ease-in-out, opacity ${DISMISS_SHRINK_MS}ms ease-in-out`;
          pillRef.current.style.transform = "scale(0.5)";
          pillRef.current.style.opacity = "0";
        }, DISMISS_COLLAPSE_MS);
      });
    });

    // Final cleanup: reset all inline styles and go to idle
    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      if (pillRef.current) {
        pillRef.current.style.cssText = "";
        const kids = pillRef.current.children;
        for (let i = 1; i < kids.length; i++) {
          (kids[i] as HTMLElement).style.cssText = "";
        }
      }
      setState("idle");
      setMessage("");
      setPartialText("");
    }, DISMISS_MS + 50);
  }, []);

  // -- Start recording --
  const startRecording = useCallback(async () => {
    if (wantsMicRef.current) return; // Already recording
    // Cancel any pending dismiss animation and reset inline styles
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    cancelAnimationFrame(dismissRafRef.current);
    // Reset any dismiss animation inline styles
    const el = pillRef.current;
    if (el) {
      el.style.cssText = "";
      const kids = el.children;
      for (let i = 1; i < kids.length; i++) {
        (kids[i] as HTMLElement).style.cssText = "";
      }
    }
    wantsMicRef.current = true;
    setMessage("");
    setPartialText("");

    // Capture frontmost app in parallel with mic acquisition (don't block on it)
    window.api
      ?.getFrontmostApp()
      .then((app) => {
        appContextRef.current = app;
      })
      .catch(() => {
        appContextRef.current = null;
      });

    // Show initializing only on the very first press (mic not yet warmed up)
    const isFirstPress = !micWarmedUp.current;
    if (isFirstPress) {
      setState("initializing");
    } else {
      setState("recording");
      playTone("start");
    }

    try {
      // Start the recorder (captures audio for REST transcription)
      const stream = await recorderRef.current.start();

      if (!wantsMicRef.current) {
        recorderRef.current.cancel();
        return;
      }

      // Mark mic as warmed up after first successful acquisition
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
              setTimeout(() => dismissPill(), 1200);
            } else {
              dismissPill();
            }
          },
          onError: (msg) => {
            // Clean up on streaming error
            streamerRef.current?.close();
            streamerRef.current = null;
            recorderRef.current.cancel();
            setState("error");
            setMessage(msg);
            setTimeout(() => dismissPill(), 2000);
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
      setTimeout(() => dismissPill(), 2000);
    }
  }, [startVisualization, dismissPill]);

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
        dismissPill();
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
        dismissPill();
        return;
      }

      await window.api.pasteText(text);
      setState("pasted");
      setMessage(text.length > 40 ? `${text.slice(0, 40)}...` : text);
      setTimeout(() => dismissPill(), 1200);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Transcription failed");
      setTimeout(() => dismissPill(), 2000);
    }
  }, [useStreaming, stopVisualization, dismissPill]);

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
      const s = stateRef.current;
      // Allow starting from idle, or from terminal states that the pill
      // may still be displaying (transcribing/pasted/error) when the
      // user presses the hotkey again before the auto-dismiss fires.
      if (
        s === "idle" ||
        s === "transcribing" ||
        s === "pasted" ||
        s === "error"
      ) {
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
  const gap = SVG_WIDTH / BARS;
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
          ref={pillRef}
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
          {/* Orb — always mounted to avoid WebGL context teardown/recreate.
              Hidden in idle via width:0 so it doesn't affect pill layout. */}
          <div
            style={{
              width: state === "idle" ? 0 : 32,
              height: 32,
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
              transition: "width 150ms ease",
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

          {state === "pasted" && (
            <span style={pillTextStyle}>
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
            <span style={pillTextStyle}>{message || "Error"}</span>
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
