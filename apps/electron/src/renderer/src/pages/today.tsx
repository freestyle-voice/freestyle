import { TutorialDemo } from "@renderer/components/tutorial-demo";
import { getApiBase } from "@renderer/lib/api";
import { cn } from "@renderer/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";

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
          className="responsive-page-scroll flex-1 overflow-auto"
          style={
            {
              WebkitAppRegion: "no-drag",
              scrollbarWidth: "none",
            } as React.CSSProperties
          }
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
                <span className="border-border bg-background absolute top-1 -left-[30px] h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed" />
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
        <p className="text-foreground m-0 text-[15px] leading-[1.55]">
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
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="mono text-foreground text-[10.5px] tracking-[0.1em] uppercase">
          {label}
        </span>
        <span className="mono text-muted-foreground text-[10.5px]">{pct}%</span>
      </div>
      <div className="bg-background h-1 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
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
