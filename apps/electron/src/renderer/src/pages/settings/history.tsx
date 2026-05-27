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
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
  today_sessions: number;
  today_cost: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

function formatTime(iso: string): string {
  const d = new Date(`${iso}Z`);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;

  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Get a date key for grouping: "today", "yesterday", or "YYYY-MM-DD" */
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

/** Calculate words per second */
function wordsPerSec(text: string, durationMs: number): string {
  if (durationMs <= 0) return "";
  const words = text.trim().split(/\s+/).length;
  const wps = words / (durationMs / 1000);
  return `${wps.toFixed(1)} w/s`;
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

  // Refetch when the pill reports a completed transcription.
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

  const clearAll = useCallback(async () => {
    if (!confirm("Clear all transcription history?")) return;
    await getClient().api.history.$delete();
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground text-sm">Loading history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-muted-foreground mt-1">
          View past transcription sessions and usage metrics.
        </p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Total Sessions"
            value={String(stats.total_sessions)}
          />
          <StatCard label="Today" value={String(stats.today_sessions)} />
          <StatCard
            label="Avg Latency"
            value={formatDuration(Math.round(stats.avg_duration_ms))}
          />
          <StatCard
            label="Total Cost"
            value={`$${stats.total_cost_usd.toFixed(2)}`}
          />
        </div>
      )}

      {/* Session list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Clock size={14} />
            Recent Sessions
          </h2>
          {total > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-muted-foreground hover:text-destructive text-xs"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search transcriptions..."
            className="border-border bg-card text-foreground w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
          />
        </div>

        {entries.length === 0 ? (
          <div className="border-border rounded-lg border border-dashed px-4 py-8 text-center">
            <TrendingUp className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
            <p className="text-muted-foreground text-sm">
              No transcription sessions yet. Use the pill to start dictating.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              // Group entries by day
              const groups: { label: string; items: HistoryEntry[] }[] = [];
              let currentLabel = "";
              for (const entry of entries) {
                const label = getDateGroup(entry.created_at);
                if (label !== currentLabel) {
                  groups.push({ label, items: [] });
                  currentLabel = label;
                }
                groups[groups.length - 1].items.push(entry);
              }
              return groups.map((group) => (
                <div key={group.label} className="space-y-2">
                  <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                    {group.label}
                  </h3>
                  {group.items.map((entry) => (
                    <HistoryCard
                      key={entry.id}
                      entry={entry}
                      onDelete={deleteEntry}
                    />
                  ))}
                </div>
              ));
            })()}
          </div>
        )}

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-muted-foreground text-xs">
              {total} {total === 1 ? "session" : "sessions"}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className={cn(
                    "rounded p-1",
                    page === 0
                      ? "text-muted-foreground/40"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-muted-foreground px-2 text-xs">
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
                      ? "text-muted-foreground/40"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryCard({
  entry,
  onDelete,
}: {
  entry: HistoryEntry;
  onDelete: (id: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = entry.cleaned_text || entry.raw_text;

  const copyText = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  const wps = wordsPerSec(text, entry.audio_duration_ms || entry.duration_ms);

  return (
    <div className="border-border group rounded-lg border px-4 py-3">
      <p className="line-clamp-5 text-sm leading-relaxed">{text}</p>
      <div className="text-muted-foreground mt-1.5 flex items-center gap-x-3 text-xs">
        <span>{formatTime(entry.created_at)}</span>
        <span>{formatDuration(entry.duration_ms)}</span>
        {wps && <span>{wps}</span>}
        <span className="mono text-[10px]">
          {entry.voice_model.includes("/")
            ? entry.voice_model.split("/").pop()
            : entry.voice_model}
        </span>
        {entry.llm_model && (
          <span className="mono text-[10px]">
            +{" "}
            {entry.llm_model.includes("/")
              ? entry.llm_model.split("/").pop()
              : entry.llm_model}
          </span>
        )}
        {entry.cost_usd > 0 && <span>${entry.cost_usd.toFixed(2)}</span>}
        <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={copyText}
            className="text-muted-foreground hover:text-foreground rounded p-1"
            title="Copy text"
          >
            {copied ? (
              <Check size={14} className="text-primary" />
            ) : (
              <Copy size={14} />
            )}
          </button>
          <button
            type="button"
            onClick={() => onDelete(entry.id)}
            className="text-muted-foreground hover:text-destructive rounded p-1"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border rounded-lg border px-3 py-2.5">
      <div className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}
