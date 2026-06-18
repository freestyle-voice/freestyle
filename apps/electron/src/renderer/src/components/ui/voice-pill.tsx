import { Orb } from "@renderer/components/ui/orb";
import { useCallback, useEffect, useRef } from "react";

/**
 * The Freestyle voice pill — the small rounded recording indicator (Orb +
 * animated level bars + glow). Extracted verbatim from the dictation pill so
 * the agent bar shows the *exact same* component during voice capture.
 *
 * Self-contained: give it a `state` and (while recording) a mic `stream`, and
 * it owns its own analyser + requestAnimationFrame bar animation. The bar mode
 * is derived from `state`: initializing → scanning, recording → live mic
 * levels, transcribing → synthetic "speaking" wave.
 */
export type VoicePillState =
  | "idle"
  | "initializing"
  | "recording"
  | "transcribing";

type BarMode = "connecting" | "listening" | "speaking";

const BARS = 14;
const RISE = 0.55;
const FALL = 0.22;
const SVG_WIDTH = 117;
const SVG_HEIGHT = 25;
const PILL_WIDTH = 216;

function smoothBars(prev: number[], next: number[]): number[] {
  return prev.map((p, i) => {
    const n = next[i] ?? 0;
    const k = n > p ? RISE : FALL;
    return p + (n - p) * k;
  });
}

interface VoicePillProps {
  state: VoicePillState;
  /** Live mic stream while recording — drives the real level bars. */
  stream: MediaStream | null;
  /** Optional trailing label (timer, queue count). */
  badge?: string | null;
  /** Vertical anchor within the host window. */
  align?: "start" | "center" | "end";
  /** Horizontal anchor within the host window. */
  side?: "center" | "right";
  /** Whether the pill is OS-draggable (the dictation pill is; the agent bar is not). */
  draggable?: boolean;
  /** Called each listening frame with the smoothed input volume (0–1). */
  onVolume?: (volume: number) => void;
}

export function VoicePill({
  state,
  stream,
  badge = null,
  align = "end",
  side = "center",
  draggable = true,
  onVolume,
}: VoicePillProps): React.JSX.Element {
  const analyserCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const barsRef = useRef<number[]>(new Array(BARS).fill(0));
  const barsSvgRef = useRef<SVGSVGElement>(null);
  const volumeRef = useRef(0);
  const rafRef = useRef<number>(0);
  const barModeRef = useRef<BarMode | null>(null);
  const scanIndexRef = useRef(0);
  const scanTickRef = useRef(0);
  const speakingStartRef = useRef(0);
  const lastIpcTimeRef = useRef(0);
  const onVolumeRef = useRef(onVolume);
  useEffect(() => {
    onVolumeRef.current = onVolume;
  }, [onVolume]);

  const getInputVolume = useCallback(() => volumeRef.current, []);

  const applyBarsToSvg = useCallback(() => {
    const svg = barsSvgRef.current;
    if (!svg) return;
    const lines = svg.querySelectorAll("line");
    for (let i = 0; i < lines.length; i++) {
      const val = barsRef.current[i] ?? 0;
      const h = Math.max(2, val * SVG_HEIGHT * 1.25);
      lines[i].setAttribute("y1", String((SVG_HEIGHT + h) / 2));
      lines[i].setAttribute("y2", String((SVG_HEIGHT - h) / 2));
      lines[i].style.opacity = String(0.5 + val * 0.5);
    }
  }, []);

  const runBars = useCallback(() => {
    const mode = barModeRef.current;
    if (!mode) return;

    if (mode === "connecting") {
      const now = performance.now();
      if (now - scanTickRef.current >= 150) {
        scanTickRef.current = now;
        scanIndexRef.current = (scanIndexRef.current + 1) % BARS;
      }
      const raw: number[] = [];
      for (let i = 0; i < BARS; i++) {
        const distA = Math.abs(i - scanIndexRef.current);
        const distB = Math.abs(i - (BARS - 1 - scanIndexRef.current));
        const dist = Math.min(distA, distB);
        raw.push(dist === 0 ? 0.7 : dist === 1 ? 0.3 : 0.05);
      }
      barsRef.current = smoothBars(barsRef.current, raw);
      volumeRef.current = 0.15;
    } else if (mode === "listening") {
      const analyser = analyserNodeRef.current;
      const dataArray = freqDataRef.current;
      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        const sliceSize = Math.floor(analyser.frequencyBinCount / BARS);
        const raw: number[] = [];
        let totalSum = 0;
        for (let i = 0; i < BARS; i++) {
          let sum = 0;
          for (let j = 0; j < sliceSize; j++)
            sum += dataArray[i * sliceSize + j];
          const val = sum / sliceSize / 255;
          raw.push(val);
          totalSum += val;
        }
        barsRef.current = smoothBars(barsRef.current, raw);
        const volume = Math.min(1, (totalSum / BARS) * 2.5);
        volumeRef.current = volume;
        const now = performance.now();
        if (now - lastIpcTimeRef.current >= 100) {
          lastIpcTimeRef.current = now;
          onVolumeRef.current?.(volume);
        }
      }
    } else if (mode === "speaking") {
      const time = (performance.now() - speakingStartRef.current) / 1000;
      const raw: number[] = [];
      for (let i = 0; i < BARS; i++) {
        const wave = Math.sin(time * 2 + i * 0.5) * 0.3 + 0.5;
        const noise = Math.sin(time * 7.3 + i * 2.1) * 0.1;
        raw.push(Math.max(0.1, Math.min(1, wave + noise)));
      }
      barsRef.current = smoothBars(barsRef.current, raw);
      volumeRef.current = 0.4;
    }

    applyBarsToSvg();
    rafRef.current = requestAnimationFrame(runBars);
  }, [applyBarsToSvg]);

  const startBarAnimation = useCallback(
    (mode: BarMode) => {
      cancelAnimationFrame(rafRef.current);
      barModeRef.current = mode;
      if (mode === "connecting") {
        scanIndexRef.current = 0;
        scanTickRef.current = performance.now();
      } else if (mode === "speaking") {
        speakingStartRef.current = performance.now();
      }
      rafRef.current = requestAnimationFrame(runBars);
    },
    [runBars],
  );

  const setupAnalyser = useCallback((s: MediaStream) => {
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

    const source = ctx.createMediaStreamSource(s);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    audioSourceRef.current = source;
    analyserNodeRef.current = analyser;
    freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
  }, []);

  const teardownAnalyser = useCallback(() => {
    try {
      audioSourceRef.current?.disconnect();
    } catch {}
    try {
      analyserNodeRef.current?.disconnect();
    } catch {}
    audioSourceRef.current = null;
    analyserNodeRef.current = null;
    freqDataRef.current = null;
  }, []);

  const stopAnimation = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    barModeRef.current = null;
    barsRef.current = new Array(BARS).fill(0);
    volumeRef.current = 0;
    applyBarsToSvg();
  }, [applyBarsToSvg]);

  // Drive the animation from `state` + `stream`.
  useEffect(() => {
    const mode: BarMode | null =
      state === "initializing"
        ? "connecting"
        : state === "recording"
          ? "listening"
          : state === "transcribing"
            ? "speaking"
            : null;

    if (mode === "listening" && stream) {
      setupAnalyser(stream);
    } else {
      teardownAnalyser();
    }

    if (mode) startBarAnimation(mode);
    else stopAnimation();
  }, [
    state,
    stream,
    setupAnalyser,
    teardownAnalyser,
    startBarAnimation,
    stopAnimation,
  ]);

  // Full teardown on unmount.
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      teardownAnalyser();
      const ctx = analyserCtxRef.current;
      if (ctx && ctx.state !== "closed") {
        try {
          ctx.close();
        } catch {}
      }
      analyserCtxRef.current = null;
    },
    [teardownAnalyser],
  );

  // ---- Render ----
  const gap = SVG_WIDTH / BARS;
  const barWidth = Math.min(gap * 0.55, 5);

  const topGlow =
    state === "initializing"
      ? "glow-initializing"
      : state === "recording"
        ? "glow-recording"
        : state === "transcribing"
          ? "glow-transcribing"
          : "glow-idle";

  const showBars =
    state === "initializing" ||
    state === "recording" ||
    state === "transcribing";

  const pillInnerStyle: React.CSSProperties = {
    height: 43,
    width: PILL_WIDTH,
    padding: "0 9px",
    borderRadius: 25,
    background: "var(--card)",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
    fontWeight: 500,
    ...(draggable
      ? ({ cursor: "grab", WebkitAppRegion: "drag" } as React.CSSProperties)
      : {}),
  };

  const itemsClass =
    align === "start"
      ? "items-start"
      : align === "center"
        ? "items-center"
        : "items-end";

  return (
    <div
      className={`flex h-screen w-screen select-none ${itemsClass} ${
        side === "right" ? "justify-end pr-3" : "justify-center"
      }`}
      style={
        draggable
          ? ({ WebkitAppRegion: "drag" } as React.CSSProperties)
          : undefined
      }
    >
      <style>
        {`
          @keyframes glow-pulse-amber {
            0%, 100% { box-shadow: 0 0 6px 2px rgba(251,191,36,0.12), 0 0 13px 3px rgba(251,191,36,0.05); }
            50% { box-shadow: 0 0 10px 2px rgba(251,191,36,0.22), 0 0 16px 4px rgba(251,191,36,0.09); }
          }
          @keyframes glow-pulse-green {
            0%, 100% { box-shadow: 0 0 6px 2px rgba(138,182,42,0.12), 0 0 13px 3px rgba(138,182,42,0.05); }
            50% { box-shadow: 0 0 10px 2px rgba(138,182,42,0.20), 0 0 16px 4px rgba(138,182,42,0.08); }
          }
          @keyframes glow-pulse-blue {
            0%, 100% { box-shadow: 0 0 6px 2px rgba(96,165,250,0.14), 0 0 13px 3px rgba(96,165,250,0.06); }
            50% { box-shadow: 0 0 10px 2px rgba(96,165,250,0.22), 0 0 16px 4px rgba(96,165,250,0.09); }
          }
          .glow-initializing { animation: glow-pulse-amber 1s ease-in-out infinite; }
          .glow-recording { animation: glow-pulse-green 2s ease-in-out infinite; }
          .glow-transcribing { animation: glow-pulse-blue 1.5s ease-in-out infinite; }
          .glow-idle { box-shadow: 0 0 5px 2px rgba(0,0,0,0.05); transition: box-shadow 300ms ease; }
        `}
      </style>

      <div
        style={{
          marginBottom: align === "end" ? 8 : undefined,
          marginTop: align === "start" ? 8 : undefined,
        }}
      >
        <div
          className={topGlow}
          style={{
            borderRadius: 25,
            visibility: state === "idle" ? "hidden" : "visible",
          }}
        >
          <div
            className="inline-flex items-center gap-2.5"
            style={pillInnerStyle}
          >
            <div
              style={
                {
                  width: 29,
                  height: 29,
                  borderRadius: "50%",
                  overflow: "hidden",
                  flexShrink: 0,
                  WebkitAppRegion: "no-drag",
                } as React.CSSProperties
              }
            >
              <Orb
                colors={
                  state === "transcribing"
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

            {showBars && (
              <svg
                ref={barsSvgRef}
                width={SVG_WIDTH}
                height={SVG_HEIGHT}
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                style={
                  {
                    display: "block",
                    flexShrink: 0,
                    WebkitAppRegion: "no-drag",
                  } as React.CSSProperties
                }
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

            {badge && (
              <span
                className="mono"
                style={
                  {
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    opacity: 0.6,
                    flexShrink: 0,
                    color: "var(--muted-foreground)",
                    paddingRight: 5,
                    WebkitAppRegion: "no-drag",
                  } as React.CSSProperties
                }
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
