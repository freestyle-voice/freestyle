import { getClient } from "@renderer/lib/api";
import { cn } from "@renderer/lib/utils";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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

interface Stats {
  total_sessions: number;
  total_duration_ms: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  avg_duration_ms: number;
  total_words: number;
  today_sessions: number;
  today_cost: number;
}

function formatClock(iso: string): string {
  return new Date(`${iso}Z`)
    .toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();
}

function formatSeconds(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function shortModel(model: string | null | undefined): string {
  if (!model) return "";
  return model.includes("/") ? (model.split("/").pop() ?? "") : model;
}

function formatCost(cost: number): string {
  if (cost === 0) return "$0.000";
  if (cost < 0.001) return "<$0.001";
  return `$${cost.toFixed(3)}`;
}

/** Get a date key for grouping: "Today", "Yesterday", or "Day, Mon DD" */
function getDateGroup(iso: string): string {
  const d = new Date(`${iso}Z`);
  const now = new Date();
  const entryDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor(
    (today.getTime() - entryDate.getTime()) / 86400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const PAGE_SIZE = 20;

export default function HistoryPage(): React.JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const query: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        orderBy: "-created_at",
      };
      if (search) query.search = search;

      const client = getClient();
      const [histRes, statsRes] = await Promise.all([
        client.api.history.$get({ query }),
        client.api.history.stats.$get(),
      ]);
      if (histRes.ok) {
        const data = await histRes.json();
        setEntries(data.items);
        setTotal(data.total);
      }
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const remove = window.api?.onTranscriptionDone(() => {
      loadData();
    });
    return () => remove?.();
  }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const deleteEntry = useCallback(
    async (id: number) => {
      await getClient().api.history[":id"].$delete({
        param: { id: String(id) },
      });
      loadData();
    },
    [loadData],
  );

  // Group entries by day for the feed.
  const groups = useMemo(() => {
    const out: { label: string; items: HistoryEntry[] }[] = [];
    let cur = "";
    for (const e of entries) {
      const label = getDateGroup(e.created_at);
      if (label !== cur) {
        out.push({ label, items: [] });
        cur = label;
      }
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [entries]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading history…</p>
      </div>
    );
  }

  const isEmpty = total === 0 && !search;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="h-9 shrink-0" />
      <div
        className="responsive-page-scroll flex-1 overflow-auto"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <PageHeader title="History" />

        {isEmpty ? (
          <EmptyState />
        ) : (
          <>
            {/* Stats */}
            <div className="border-border mb-7 grid grid-cols-2 gap-2.5 border-b pb-7 md:grid-cols-4">
              <Stat
                n={(stats?.total_words ?? 0).toLocaleString()}
                l="words all time"
              />
              <Stat n={String(stats?.total_sessions ?? 0)} l="sessions" />
              <Stat
                n={
                  stats && stats.avg_duration_ms > 0
                    ? formatSeconds(Math.round(stats.avg_duration_ms))
                    : "—"
                }
                l="avg latency"
              />
              <Stat
                accent
                n={`$${(stats?.total_cost_usd ?? 0).toFixed(2)}`}
                l="cost · all time"
              />
            </div>

            {/* Search */}
            <div className="border-border bg-card mb-6 flex items-center gap-2 rounded-lg border px-3 py-2">
              <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder={`Search ${total} transcript${total === 1 ? "" : "s"}…`}
                className="placeholder:text-muted-foreground/80 text-foreground flex-1 bg-transparent text-[13px] outline-none"
              />
              <span className="mono text-muted-foreground text-[10px]">
                ⌘ K
              </span>
            </div>

            {entries.length === 0 ? (
              <NoSearchResults />
            ) : (
              groups.map((group) =>
                group.items.length === 0 ? null : (
                  <FeedGroup key={group.label} label={group.label}>
                    {group.items.map((entry) => (
                      <FeedItem
                        key={entry.id}
                        entry={entry}
                        onDelete={deleteEntry}
                      />
                    ))}
                  </FeedGroup>
                ),
              )
            )}

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="border-border mt-4 flex items-center justify-between border-t pt-4">
                <span className="mono text-muted-foreground text-[11px] uppercase tracking-[0.12em]">
                  {total} {total === 1 ? "session" : "sessions"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className={cn(
                      "rounded p-1",
                      page === 0
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : "text-muted-foreground hover:text-foreground cursor-pointer",
                    )}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="mono text-muted-foreground px-2 text-[11px]">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={page >= totalPages - 1}
                    className={cn(
                      "rounded p-1",
                      page >= totalPages - 1
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : "text-muted-foreground hover:text-foreground cursor-pointer",
                    )}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}): React.JSX.Element {
  return (
    <div className="mb-7">
      <h1 className="serif text-foreground m-0 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
        <span className="serif-italic text-primary">{title}</span>
        <span>. </span>
      </h1>
      {subtitle && (
        <p className="text-muted-foreground mt-2.5 max-w-[580px] text-[14px] leading-[1.5]">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Stat({
  n,
  l,
  accent,
}: {
  n: string;
  l: string;
  accent?: boolean;
}): React.JSX.Element {
  return (
    <div className="border-border bg-card rounded-[11px] border px-[18px] py-4">
      <div
        className={cn(
          "serif-italic text-[38px] leading-none",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {n}
      </div>
      <div className="mono text-muted-foreground mt-2 text-[10px] uppercase tracking-[0.14em]">
        {l}
      </div>
    </div>
  );
}

function FeedGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="mb-7">
      <div className="mb-3 flex items-center gap-3">
        <div className="mono text-muted-foreground text-[10px] uppercase tracking-[0.18em]">
          {label}
        </div>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function FeedItem({
  entry,
  onDelete,
}: {
  entry: HistoryEntry;
  onDelete: (id: number) => void;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const text = entry.cleaned_text || entry.raw_text;
  const voice = shortModel(entry.voice_model) || entry.voice_provider;
  const llm = shortModel(entry.llm_model);
  const modelLabel = llm ? `${voice} · ${llm}` : voice;

  const copyText = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <div className="group px-1.5 py-3.5">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="mono text-foreground text-[11px] font-medium tracking-[0.04em]">
          {formatClock(entry.created_at)}
        </span>
        <span className="bg-muted-foreground/50 h-[3px] w-[3px] rounded-full" />
        <span className="mono text-primary text-[10.5px] font-semibold uppercase tracking-[0.12em]">
          {modelLabel}
        </span>
        <span className="flex-1" />
        <span className="mono text-muted-foreground text-[10px] tracking-[0.06em]">
          {formatSeconds(entry.audio_duration_ms || entry.duration_ms)}
        </span>
        {entry.cost_usd > 0 && (
          <span className="mono text-muted-foreground text-[10px]">
            · {formatCost(entry.cost_usd)}
          </span>
        )}
        <div className="ml-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={copyText}
            className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1"
            title="Copy text"
          >
            {copied ? (
              <Check size={13} className="text-primary" />
            ) : (
              <Copy size={13} />
            )}
          </button>
          <button
            type="button"
            onClick={() => onDelete(entry.id)}
            className="text-muted-foreground hover:text-destructive cursor-pointer rounded p-1"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <p
        className="text-foreground m-0 text-[16px] leading-[1.55]"
        style={{ textWrap: "pretty" as never }}
      >
        “{text}”
      </p>
    </div>
  );
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="border-border bg-card mt-4 rounded-[14px] border border-dashed px-9 py-[60px] text-center">
      <div className="bg-accent mx-auto mb-[18px] inline-flex h-16 w-16 items-center justify-center rounded-2xl">
        <Clock className="text-primary h-7 w-7" />
      </div>
      <h2 className="serif text-foreground m-0 text-[32px] font-medium leading-none">
        Nothing recorded yet.
      </h2>
      <p className="text-muted-foreground mx-auto mt-2.5 max-w-[440px] text-[14px] leading-[1.55]">
        Hold your hotkey anywhere on your Mac, speak, release. Your first
        transcript will appear here.
      </p>
    </div>
  );
}

function NoSearchResults(): React.JSX.Element {
  return (
    <div className="text-muted-foreground py-10 text-center">
      <span className="serif-italic text-[20px]">
        no transcripts match that search.
      </span>
    </div>
  );
}
