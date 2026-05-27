import { formatAcceleratorKeys } from "@renderer/hooks/use-hotkey-recorder";
import { getApiBase } from "@renderer/lib/api";
import { cn } from "@renderer/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HistoryEntry {
  id: number;
  raw_text: string;
  cleaned_text: string | null;
  voice_provider: string;
  voice_model: string;
  llm_provider: string | null;
  llm_model: string | null;
  duration_ms: number;
  audio_duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parses `created_at` (stored as UTC) into a local Date. */
function parseUtc(iso: string): Date {
  return new Date(`${iso}Z`);
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatClock(d: Date): string {
  return d
    .toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();
}

function formatMinutes(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatModelLabel(entry: HistoryEntry): string {
  const voice = entry.voice_model || entry.voice_provider;
  if (entry.llm_model) {
    return `${voice} · ${entry.llm_model}`;
  }
  return voice;
}

// Build a 24-bin (per-hour) histogram of word activity for today.
function buildHourly(entries: HistoryEntry[]): number[] {
  const bins = new Array<number>(24).fill(0);
  for (const e of entries) {
    const h = parseUtc(e.created_at).getHours();
    bins[h] += wordCount(e.cleaned_text || e.raw_text);
  }
  return bins;
}

interface UsageBucket {
  label: string;
  pct: number;
}

// Bucket entries by voice model and convert to top N + "other" usage bars.
function buildModelBuckets(entries: HistoryEntry[]): UsageBucket[] {
  if (entries.length === 0) return [];
  const counts = new Map<string, number>();
  for (const e of entries) {
    const key = e.voice_model || e.voice_provider || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = entries.length;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 4);
  const rest = sorted.slice(4).reduce((s, [, n]) => s + n, 0);
  const buckets: UsageBucket[] = top.map(([label, n]) => ({
    label,
    pct: Math.round((n / total) * 100),
  }));
  if (rest > 0) {
    buckets.push({ label: "other", pct: Math.round((rest / total) * 100) });
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TodayPage(): React.JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  const loadToday = useCallback(() => {
    const params = new URLSearchParams({
      limit: "200",
      orderBy: "-created_at",
    });
    fetch(`${getApiBase()}/api/history?${params}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items: HistoryEntry[] }) => {
        const now = new Date();
        const todaysEntries = data.items.filter((e) =>
          isSameLocalDay(parseUtc(e.created_at), now),
        );
        setEntries(todaysEntries);
      })
      .catch(() => setEntries([]));
  }, []);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  // Refetch when the pill reports a completed transcription.
  useEffect(() => {
    const remove = window.api?.onTranscriptionDone(() => {
      loadToday();
    });
    return () => remove?.();
  }, [loadToday]);

  const stats = useMemo(() => {
    if (!entries) return null;
    let words = 0;
    let audioMs = 0;
    let cost = 0;
    for (const e of entries) {
      words += wordCount(e.cleaned_text || e.raw_text);
      audioMs += e.audio_duration_ms;
      cost += e.cost_usd;
    }
    const audioSec = audioMs / 1000;
    const wpm = audioSec > 0 ? Math.round(words / (audioSec / 60)) : 0;
    return {
      words,
      sessions: entries.length,
      wpm,
      audioSec,
      cost,
    };
  }, [entries]);

  const hourly = useMemo(
    () => (entries ? buildHourly(entries) : new Array(24).fill(0)),
    [entries],
  );

  const buckets = useMemo(
    () => (entries ? buildModelBuckets(entries) : []),
    [entries],
  );

  const isEmpty = entries !== null && entries.length === 0;

  // Reverse-chronological: latest session at the top.
  const ordered = useMemo(() => {
    if (!entries) return [];
    return [...entries].sort(
      (a, b) =>
        parseUtc(b.created_at).getTime() - parseUtc(a.created_at).getTime(),
    );
  }, [entries]);

  return (
    <div className="flex h-full min-h-0">
      {/* Center column */}
      <div
        className="flex min-w-0 flex-1 flex-col"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        {/* macOS drag region — the title bar area */}
        <div className="h-9 shrink-0" />
        <div
          className="flex-1 overflow-auto px-9 pb-6"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <TutorialDemo />

          {isEmpty ? (
            <EmptyTimeline />
          ) : (
            <div className="relative pl-[100px]">
              <div className="bg-border absolute top-0 bottom-0 left-[75px] w-px" />
              {/* "Open slot" cap — represents the next, future session. With
                  reverse-chronological order it sits above the latest entry. */}
              <div className="relative mb-5">
                <span className="border-border bg-background absolute top-1 -left-[25px] h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed" />
                <span className="serif-italic text-muted-foreground text-[18px]">
                  ready when you are…
                </span>
              </div>
              {ordered.map((e) => (
                <TimelineNode key={e.id} entry={e} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right rail — day summary */}
      <aside className="border-border bg-sidebar hidden lg:flex w-[280px] shrink-0 flex-col gap-7 border-l px-7 pt-[44px] pb-9 overflow-auto">
        <section>
          <RailLabel>In numbers</RailLabel>
          <RailStat
            big
            n={stats ? stats.words.toLocaleString() : "—"}
            l="words today"
          />
          <RailStat
            accent
            n={stats && stats.wpm > 0 ? String(stats.wpm) : "—"}
            l="avg wpm"
          />
          <RailStat
            n={stats ? formatMinutes(stats.audioSec) : "0:00"}
            l="min spoken"
          />
        </section>

        <section>
          <RailLabel>Most used</RailLabel>
          {buckets.length === 0 ? (
            <p className="text-muted-foreground py-3 text-[12px] italic leading-relaxed">
              No models yet. Models will appear here as you dictate.
            </p>
          ) : (
            buckets.map((b) => <UsageBar key={b.label} {...b} />)
          )}
        </section>

        <section>
          <RailLabel>Activity · 24h</RailLabel>
          <HourSpark data={hourly} />
        </section>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tutorial — animated 3-phase loop:
//   idle (1.8s) → pressed (3.6s, animated wave) → result (2.4s, transcript)
// On real hotkey-down/up, the auto-loop is suspended and the demo follows
// the user's actual press.
// ---------------------------------------------------------------------------

type DemoPhase = "idle" | "pressed" | "result";

const PHASE_STEPS: ReadonlyArray<readonly [DemoPhase, number]> = [
  ["idle", 1800],
  ["pressed", 3600],
  ["result", 2400],
];

const SAMPLE_TRANSCRIPT = "Pushing the meeting to tomorrow at ten.";

function TutorialDemo(): React.JSX.Element {
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const [hotkeyTokens, setHotkeyTokens] = useState<string[]>(["fn"]);
  const stepRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  // suspendedRef pauses the auto-loop while the real hotkey is held
  const suspendedRef = useRef(false);
  // Latest mic amplitude (0..1) broadcast by the pill via main. Refs avoid
  // re-rendering this component at 60Hz; Wave reads it inside its RAF loop.
  const audioLevelRef = useRef(0);
  // True while the real hotkey is held — switches Wave from scripted
  // amplitude to live amplitude.
  const livePressRef = useRef(false);

  const clearLoop = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Auto-loop tick. Re-entered after each timeout fires (or when manually
  // restarted after a real hotkey release).
  const tick = useCallback(() => {
    if (suspendedRef.current) return;
    const [name, dur] = PHASE_STEPS[stepRef.current % PHASE_STEPS.length];
    setPhase(name);
    stepRef.current += 1;
    timeoutRef.current = window.setTimeout(tick, dur);
  }, []);

  useEffect(() => {
    tick();
    return clearLoop;
  }, [tick, clearLoop]);

  // Load the configured hotkey once.
  useEffect(() => {
    fetch(`${getApiBase()}/api/settings/hotkey`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { value?: string } | null) => {
        if (data?.value) {
          const tokens = formatAcceleratorKeys(data.value);
          if (tokens.length > 0) setHotkeyTokens(tokens);
        }
      })
      .catch(() => {});
  }, []);

  // Real hotkey events override the loop while held.
  useEffect(() => {
    const removeDown = window.api?.onHotkeyDown(() => {
      suspendedRef.current = true;
      livePressRef.current = true;
      // Reset amplitude so the wave starts flat until the pill warms up
      // the mic (usually within 100ms).
      audioLevelRef.current = 0;
      clearLoop();
      setPhase("pressed");
    });
    const removeUp = window.api?.onHotkeyUp(() => {
      livePressRef.current = false;
      setPhase("result");
      clearLoop();
      timeoutRef.current = window.setTimeout(() => {
        // Resume auto-loop on the next phase after a result hold.
        suspendedRef.current = false;
        stepRef.current = 0;
        tick();
      }, PHASE_STEPS[2][1]);
    });
    return () => {
      removeDown?.();
      removeUp?.();
    };
  }, [tick, clearLoop]);

  // Subscribe to live audio levels broadcast by the pill. Writing to a ref
  // (rather than state) avoids 60Hz re-renders.
  useEffect(() => {
    const remove = window.api?.onAudioLevel((level: number) => {
      audioLevelRef.current = level;
    });
    return () => remove?.();
  }, []);

  // Stable accessor — Wave's RAF effect depends on it; recreating it each
  // render would tear down and rebuild the RAF loop.
  const getLiveLevel = useCallback(
    () => (livePressRef.current ? audioLevelRef.current : null),
    [],
  );

  const pressed = phase === "pressed";
  const showResult = phase === "result";

  return (
    <div className="border-border bg-card mb-8 flex flex-col items-center gap-5 rounded-[16px] border px-7 py-7">
      {/* Instructional sentence */}
      <div className="text-center">
        <div className="serif text-foreground text-[34px] leading-[1.1] font-normal tracking-tight">
          <StepWord active={phase === "idle"}>Press</StepWord>{" "}
          <span className="inline-block align-middle">
            {hotkeyTokens.map((tok, i) => (
              <span key={`${tok}-${i}`} className="inline-block align-middle">
                {i > 0 && (
                  <span className="text-muted-foreground mx-1 text-[16px]">
                    +
                  </span>
                )}
                <FnKey pressed={pressed} label={tok} />
              </span>
            ))}
          </span>{" "}
          <StepWord active={pressed}>, speak,</StepWord>{" "}
          <StepWord active={showResult}>release.</StepWord>
        </div>
      </div>

      {/* Wave + status card */}
      <div
        className={cn(
          "relative w-full max-w-[560px] overflow-hidden rounded-[12px] border px-5 py-4 transition-colors duration-200",
          pressed ? "border-primary bg-accent" : "border-border bg-sidebar",
        )}
      >
        <div className="mb-2 flex items-center gap-2.5">
          <span
            className={cn(
              "h-[7px] w-[7px] rounded-full transition-all duration-200",
              pressed
                ? "bg-primary opacity-100"
                : showResult
                  ? "bg-primary opacity-100"
                  : "bg-muted-foreground opacity-40",
            )}
            style={
              pressed ? { animation: "tdot 1.6s infinite ease-in-out" } : {}
            }
          />
          <span
            className={cn(
              "mono text-[10px] font-semibold tracking-[0.16em] uppercase transition-colors",
              pressed
                ? "text-accent-foreground"
                : showResult
                  ? "text-accent-foreground"
                  : "text-muted-foreground",
            )}
          >
            {phase === "idle"
              ? "Ready"
              : pressed
                ? "Listening…"
                : "Pasted to your app"}
          </span>
        </div>

        <Wave pressed={pressed} getLiveLevel={getLiveLevel} />

        {/* Result transcript */}
        <div
          className="mt-1 min-h-[24px] transition-all duration-300"
          style={{
            opacity: showResult ? 1 : 0,
            transform: showResult ? "translateY(0)" : "translateY(4px)",
          }}
        >
          <span className="serif text-foreground text-[17px] leading-[1.4]">
            "{SAMPLE_TRANSCRIPT}"
          </span>
        </div>
      </div>

      {/* CSS for the pulsing status dot */}
      <style>{`@keyframes tdot { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.4); opacity: 0.5 } }`}</style>
    </div>
  );
}

function StepWord({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <span
      className={cn(
        "serif-italic transition-colors duration-200",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// FnKey — keycap that depresses on `pressed`.
// ---------------------------------------------------------------------------
function FnKey({
  pressed,
  label,
}: {
  pressed: boolean;
  label: string;
}): React.JSX.Element {
  const size = 38;
  return (
    <span
      className={cn(
        "mono inline-flex items-center justify-center align-middle font-semibold transition-all duration-150",
        pressed ? "text-accent-foreground" : "text-foreground",
      )}
      style={{
        height: size * 0.95,
        minWidth: size * 1.05,
        padding: "0 8px",
        borderRadius: size * 0.18,
        background: pressed ? "var(--accent)" : "var(--card)",
        border: `1.5px solid ${pressed ? "var(--primary)" : "var(--border)"}`,
        borderBottomWidth: pressed ? 1.5 : Math.max(2, size * 0.075),
        fontSize: size * 0.4,
        letterSpacing: "0.04em",
        transform: pressed ? `translateY(${size * 0.04}px)` : "translateY(0)",
        boxShadow: pressed
          ? `inset 0 -1px 0 rgba(20,12,4,0.06), 0 0 0 6px var(--accent)`
          : `0 1px 0 var(--border), 0 2px 2px -1px rgba(20,12,4,0.06)`,
        transitionTimingFunction: "cubic-bezier(0.3, 0.7, 0.4, 1)",
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Wave — SVG polyline. While `pressed`, redraws on requestAnimationFrame
// using a sine-envelope × harmonics formula; otherwise renders a flat line.
// `getLiveLevel` returns the latest real mic amplitude (0..1) when the real
// hotkey is being held, or null when the demo is running its scripted loop.
// ---------------------------------------------------------------------------
function Wave({
  pressed,
  getLiveLevel,
}: {
  pressed: boolean;
  getLiveLevel: () => number | null;
}): React.JSX.Element {
  const W = 520;
  const H = 60;
  const polyRef = useRef<SVGPolylineElement>(null);
  // Smoothed amplitude so the wave doesn't twitch on noisy frames.
  const smoothedAmpRef = useRef(0);

  useEffect(() => {
    const node = polyRef.current;
    if (!node) return;

    if (!pressed) {
      // Flat resting line — set once, no animation loop.
      smoothedAmpRef.current = 0;
      const N = 60;
      const pts: string[] = [];
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * W;
        pts.push(`${x.toFixed(1)},${(H / 2).toFixed(1)}`);
      }
      node.setAttribute("points", pts.join(" "));
      return;
    }

    let rafId = 0;
    const start = performance.now();
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      const N = 90;
      // Pick amplitude source: real mic level (when real hotkey is held)
      // or the scripted loudness envelope. Live level gets gain + smoothing
      // so quiet voices still draw a visible wave and the wave doesn't
      // pop on transients.
      const liveLevel = getLiveLevel();
      let amp: number;
      if (liveLevel !== null) {
        const target = Math.min(1, liveLevel * 1.6);
        smoothedAmpRef.current += (target - smoothedAmpRef.current) * 0.35;
        amp = smoothedAmpRef.current;
      } else {
        amp =
          (0.6 + 0.4 * Math.sin(t * 1.3)) * (0.7 + 0.3 * Math.sin(t * 2.4 + 1));
      }
      const pts: string[] = [];
      for (let i = 0; i <= N; i++) {
        const tt = i / N;
        const x = tt * W;
        // tapered envelope so the wave fades at both ends
        const envelope = Math.sin(Math.PI * tt);
        const a = H * 0.42 * amp * envelope;
        const y =
          H / 2 +
          a * Math.sin(tt * 9 * Math.PI + t * 5.2) * 0.7 +
          a * Math.sin(tt * 17 * Math.PI - t * 3.1) * 0.25;
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      // Direct DOM write avoids one React re-render per frame.
      node.setAttribute("points", pts.join(" "));
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [pressed, getLiveLevel]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      className="block"
      role="img"
      aria-label="Voice waveform"
    >
      <polyline
        ref={polyRef}
        fill="none"
        stroke={
          pressed ? "var(--accent-foreground)" : "var(--muted-foreground)"
        }
        strokeWidth={pressed ? 2 : 1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: "stroke 0.2s ease, stroke-width 0.2s ease" }}
      />
    </svg>
  );
}

function TimelineNode({ entry }: { entry: HistoryEntry }): React.JSX.Element {
  const ts = parseUtc(entry.created_at);
  const text = entry.cleaned_text || entry.raw_text;
  const words = wordCount(text);
  const audioSec = Math.round(entry.audio_duration_ms / 1000);
  const wpm =
    entry.audio_duration_ms > 0
      ? Math.round(words / (entry.audio_duration_ms / 60000))
      : 0;

  return (
    <div className="relative mb-[18px]">
      {/* dot */}
      <span
        className="bg-primary absolute top-2 -left-[30px] h-2.5 w-2.5 rounded-full"
        style={{
          border: "2px solid var(--background)",
          boxShadow: "0 0 0 1px var(--primary)",
        }}
      />
      {/* time in margin */}
      <div className="absolute -left-[100px] top-1 w-[60px] text-right">
        <div className="mono text-foreground text-[11px] font-medium tracking-[0.04em]">
          {formatClock(ts)}
        </div>
      </div>

      <div className="border-border bg-card rounded-[11px] border px-[18px] py-[14px]">
        <div className="mb-2 flex items-center gap-2.5">
          <span className="mono text-primary text-[10.5px] font-semibold tracking-[0.14em] uppercase">
            {formatModelLabel(entry)}
          </span>
          <span className="flex-1" />
          <span className="mono text-muted-foreground text-[10.5px] tracking-[0.04em]">
            {wpm > 0 ? `${wpm} wpm · ` : ""}
            {audioSec}s · {words} wds
          </span>
        </div>
        <p className="serif text-foreground m-0 text-[17px] leading-[1.5]">
          “{text}”
        </p>
      </div>
    </div>
  );
}

function EmptyTimeline(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div
        className="border-border bg-background mb-4 h-3 w-3 rounded-full"
        style={{ borderStyle: "dashed", borderWidth: "1.5px" }}
      />
      <span className="serif-italic text-muted-foreground text-[22px] leading-snug">
        your day is unwritten — your first session will land here.
      </span>
    </div>
  );
}

function RailLabel({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="mono text-muted-foreground mb-3 text-[10px] tracking-[0.18em] uppercase">
      {children}
    </div>
  );
}

function RailStat({
  n,
  l,
  big,
  accent,
}: {
  n: string;
  l: string;
  big?: boolean;
  accent?: boolean;
}): React.JSX.Element {
  return (
    <div className={cn("flex items-baseline gap-2.5", big ? "mb-4" : "mb-3")}>
      <span
        className={cn(
          "serif-italic leading-none",
          big ? "text-[44px]" : "text-[26px]",
          "min-w-[70px]",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {n}
      </span>
      <span className="mono text-muted-foreground text-[10px] leading-snug tracking-[0.12em] uppercase">
        {l}
      </span>
    </div>
  );
}

function UsageBar({ label, pct }: UsageBucket): React.JSX.Element {
  return (
    <div className="mb-1.5 flex items-center gap-2.5">
      <span
        className="mono text-foreground text-[10.5px] tracking-[0.1em] uppercase shrink-0 truncate"
        style={{ width: 92 }}
        title={label}
      >
        {label}
      </span>
      <div className="bg-background h-1 flex-1 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="mono text-muted-foreground w-[30px] text-right text-[10.5px]">
        {pct}%
      </span>
    </div>
  );
}

function HourSpark({ data }: { data: number[] }): React.JSX.Element {
  const W = 280;
  const H = 64;
  const max = Math.max(...data, 1);
  const barW = W / data.length;
  return (
    <svg
      viewBox={`0 0 ${W} ${H + 14}`}
      width="100%"
      height={H + 14}
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Hourly activity"
    >
      <line
        x1="0"
        y1={H - 0.5}
        x2={W}
        y2={H - 0.5}
        stroke="var(--border)"
        strokeWidth="1"
      />
      {data.map((v, i) => {
        const h = max ? (v / max) * (H - 6) : 0;
        const x = i * barW + barW * 0.18;
        const isEmpty = v === 0;
        return (
          <rect
            key={i}
            x={x}
            y={H - h - 1}
            width={barW * 0.64}
            height={Math.max(1, h)}
            fill={isEmpty ? "var(--border)" : "var(--primary)"}
            opacity={isEmpty ? 0.4 : 0.85}
            rx="1"
          />
        );
      })}
      {[0, 6, 12, 18, 23].map((t) => (
        <text
          key={t}
          x={(t + 0.5) * barW}
          y={H + 12}
          fontFamily="JetBrains Mono"
          fontSize="9"
          fill="var(--muted-foreground)"
          textAnchor="middle"
        >
          {t === 23 ? "24" : String(t).padStart(2, "0")}
        </text>
      ))}
    </svg>
  );
}
