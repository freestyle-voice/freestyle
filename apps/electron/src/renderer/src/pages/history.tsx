import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Label } from "@renderer/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@renderer/components/ui/sheet";
import { getClient } from "@renderer/lib/api";
import { cn, ON_DEVICE_PHRASE } from "@renderer/lib/utils";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Filter,
  Redo2,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { SETTINGS_KEYS } from "../../../shared/settings-keys";

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
  unfiltered_total_sessions: number;
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

function getLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const { t } = useTranslation();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyPaused, setHistoryPaused] = useState(false);
  const [activePreset, setActivePreset] = useState<
    "today" | "weekly" | "monthly" | "all-time" | "custom"
  >("weekly");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  // Calculate preset dates dynamically on every render
  const todayStr = getLocalDateString(new Date());
  const start7 = new Date();
  start7.setDate(start7.getDate() - 7);
  const start7Str = getLocalDateString(start7);
  const start30 = new Date();
  start30.setDate(start30.getDate() - 30);
  const start30Str = getLocalDateString(start30);

  let startDate = "";
  let endDate = "";
  if (activePreset === "today") {
    startDate = todayStr;
    endDate = todayStr;
  } else if (activePreset === "weekly") {
    startDate = start7Str;
    endDate = todayStr;
  } else if (activePreset === "monthly") {
    startDate = start30Str;
    endDate = todayStr;
  } else if (activePreset === "custom") {
    startDate = customStartDate;
    endDate = customEndDate;
  }

  const isTodayPreset = activePreset === "today";
  const isWeeklyPreset = activePreset === "weekly";
  const isMonthlyPreset = activePreset === "monthly";

  const getTimeLabel = (): string => {
    if (activePreset === "weekly") return t("history.timeLabelPast7");
    if (activePreset === "today") return t("history.timeLabelToday");
    if (activePreset === "monthly") return t("history.timeLabelPast30");
    if (activePreset === "all-time") return t("history.timeLabelAllTime");
    return t("history.timeLabelFiltered");
  };
  const timeLabel = getTimeLabel();

  const filterCount = activePreset !== "all-time" ? 1 : 0;

  const loadData = useCallback(async () => {
    try {
      const query: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        orderBy: "-created_at",
      };
      if (search) query.search = search;
      if (startDate) query.start_date = startDate;
      if (endDate) query.end_date = endDate;

      const statsQuery: Record<string, string> = {};
      if (startDate) statsQuery.start_date = startDate;
      if (endDate) statsQuery.end_date = endDate;

      const client = getClient();
      const [histRes, statsRes] = await Promise.all([
        client.api.history.$get({ query }),
        client.api.history.stats.$get({ query: statsQuery }),
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
  }, [page, search, startDate, endDate]);

  const loadHistoryPaused = useCallback(async () => {
    try {
      const res = await getClient().api.settings[":key"].$get({
        param: { key: SETTINGS_KEYS.historyPaused },
      });
      const data = res.ok ? await res.json() : null;
      setHistoryPaused(data?.value === "true");
    } catch {
      setHistoryPaused(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadHistoryPaused();
  }, [loadData, loadHistoryPaused]);

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
        <p className="text-muted-foreground text-sm">{t("history.loading")}</p>
      </div>
    );
  }

  const isGenuineEmpty = stats?.unfiltered_total_sessions === 0;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="h-7 shrink-0" />
      <div
        className="responsive-page-scroll flex-1 overflow-auto"
        style={
          {
            WebkitAppRegion: "no-drag",
            scrollbarWidth: "none",
          } as React.CSSProperties
        }
      >
        <PageHeader title={t("history.title")} />

        {historyPaused && <HistoryPausedNotice />}

        {isGenuineEmpty ? (
          <EmptyState />
        ) : (
          <>
            {/* Stats */}
            <div className="border-border mb-7 grid grid-cols-2 gap-2.5 border-b pb-7 md:grid-cols-4">
              <Stat
                n={(stats?.total_words ?? 0).toLocaleString()}
                l={t("history.wordsStat", { label: timeLabel })}
              />
              <Stat
                n={String(stats?.total_sessions ?? 0)}
                l={t("history.sessionsStat", { label: timeLabel })}
              />
              <Stat
                n={
                  stats && stats.avg_duration_ms > 0
                    ? formatSeconds(Math.round(stats.avg_duration_ms))
                    : "—"
                }
                l={t("history.avgLatency")}
              />
              <Stat
                accent
                n={`$${(stats?.total_cost_usd ?? 0).toFixed(2)}`}
                l={t("history.costStat", { label: timeLabel })}
              />
            </div>

            {/* Search & Filter Row */}
            <div className="mb-6 flex gap-2">
              <div className="border-border bg-card flex flex-1 items-center gap-2 rounded-lg border px-3 py-2">
                <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder={
                    total === 1
                      ? t("history.searchSingular", { total })
                      : t("history.searchPlural", { total })
                  }
                  className="placeholder:text-muted-foreground/80 text-foreground flex-1 bg-transparent text-[13px] outline-none"
                />
                <span className="mono text-muted-foreground text-[10px]">
                  ⌘ K
                </span>
              </div>
              <Button
                variant="outline"
                onClick={() => setFilterOpen(true)}
                className={cn(
                  "text-muted-foreground",
                  filterCount > 0 && "border-primary text-primary bg-primary/5",
                )}
              >
                <Filter data-icon="inline-start" />
                <span>{t("history.filtersBtn")}</span>
                {filterCount > 0 && (
                  <Badge className="h-4 min-w-4 px-1 text-[9px] font-bold">
                    {filterCount}
                  </Badge>
                )}
              </Button>
            </div>

            {entries.length === 0 ? (
              <NoSearchResults
                hasSearch={!!search}
                hasDates={activePreset !== "all-time"}
                onClear={() => {
                  setSearch("");
                  setActivePreset("all-time");
                  setCustomStartDate("");
                  setCustomEndDate("");
                  setPage(0);
                }}
              />
            ) : (
              groups.map((group) =>
                group.items.length === 0 ? null : (
                  <FeedGroup
                    key={group.label}
                    label={
                      group.label === "Today"
                        ? t("history.groupToday")
                        : group.label === "Yesterday"
                          ? t("history.groupYesterday")
                          : group.label
                    }
                  >
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
                  {total}{" "}
                  {total === 1
                    ? t("history.sessionSingular")
                    : t("history.sessionPlural")}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    aria-label="Previous page"
                  >
                    <ChevronLeft />
                  </Button>
                  <span className="mono text-muted-foreground px-2 text-[11px]">
                    {page + 1} / {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={page >= totalPages - 1}
                    aria-label="Next page"
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent className="flex flex-col p-6 w-[340px] sm:w-[400px]">
          <SheetHeader className="p-0 mb-4">
            <SheetTitle className="text-lg font-semibold">
              {t("history.filterTitle")}
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-5 flex-1">
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="start-date-input"
                className="mono text-muted-foreground text-[10px] uppercase tracking-wider"
              >
                {t("history.startDate")}
              </Label>
              <Input
                id="start-date-input"
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => {
                  const val = e.target.value;
                  setActivePreset("custom");
                  if (endDate && val > endDate) {
                    setCustomStartDate(endDate);
                    setCustomEndDate(endDate);
                  } else {
                    setCustomStartDate(val);
                    setCustomEndDate(endDate);
                  }
                  setPage(0);
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label
                htmlFor="end-date-input"
                className="mono text-muted-foreground text-[10px] uppercase tracking-wider"
              >
                {t("history.endDate")}
              </Label>
              <Input
                id="end-date-input"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => {
                  const val = e.target.value;
                  setActivePreset("custom");
                  if (startDate && val < startDate) {
                    setCustomEndDate(startDate);
                    setCustomStartDate(startDate);
                  } else {
                    setCustomEndDate(val);
                    setCustomStartDate(startDate);
                  }
                  setPage(0);
                }}
              />
            </div>

            {/* Quick Presets */}
            <div className="flex flex-col gap-2 mt-2">
              <span className="mono text-muted-foreground text-[10px] uppercase tracking-wider">
                {t("history.presetsLabel")}
              </span>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={isTodayPreset ? "default" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setActivePreset("today");
                    setPage(0);
                  }}
                >
                  {t("history.presetToday")}
                </Button>
                <Button
                  variant={isWeeklyPreset ? "default" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setActivePreset("weekly");
                    setPage(0);
                  }}
                >
                  {t("history.presetLast7")}
                </Button>
                <Button
                  variant={isMonthlyPreset ? "default" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setActivePreset("monthly");
                    setPage(0);
                  }}
                >
                  {t("history.presetLast30")}
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-4 border-t border-border flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setActivePreset("all-time");
                setCustomStartDate("");
                setCustomEndDate("");
                setPage(0);
              }}
            >
              {t("history.clearAll")}
            </Button>
            <Button
              variant="default"
              className="flex-1"
              onClick={() => setFilterOpen(false)}
            >
              {t("history.done")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
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
  const hasAiEdit =
    !!entry.cleaned_text && entry.cleaned_text.trim() !== entry.raw_text.trim();
  const [showAiEdit, setShowAiEdit] = useState(hasAiEdit);
  const text =
    showAiEdit && entry.cleaned_text ? entry.cleaned_text : entry.raw_text;
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
          {hasAiEdit && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowAiEdit((value) => !value)}
              title={showAiEdit ? "Undo AI edit" : "Redo AI edit"}
              aria-label={showAiEdit ? "Undo AI edit" : "Redo AI edit"}
            >
              {showAiEdit ? <Undo2 /> : <Redo2 />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={copyText}
            title="Copy text"
            aria-label="Copy text"
          >
            {copied ? <Check className="text-primary" /> : <Copy />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onDelete(entry.id)}
            className="hover:text-destructive"
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <p
        className="text-foreground m-0 text-[16px] leading-[1.55]"
        style={{ textWrap: "pretty" as never }}
        dir="auto"
      >
        “{text}”
      </p>
    </div>
  );
}

function HistoryPausedNotice(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="border-yellow-500/35 bg-yellow-300/15 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border px-4 py-3 text-yellow-950 dark:border-yellow-300/35 dark:bg-yellow-400/15 dark:text-yellow-100">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold">
          {t("history.pausedTitle")}
        </div>
        <p className="mt-0.5 text-[12px] leading-snug opacity-80">
          {t("history.pausedDesc")}
        </p>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link to="/settings#data">{t("history.pausedSettings")}</Link>
      </Button>
    </div>
  );
}

function EmptyState(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="border-border bg-card mt-4 rounded-[14px] border border-dashed px-9 py-[60px] text-center">
      <div className="bg-accent mx-auto mb-[18px] inline-flex h-16 w-16 items-center justify-center rounded-2xl">
        <Clock className="text-primary h-7 w-7" />
      </div>
      <h2 className="serif text-foreground m-0 text-[32px] font-medium leading-none">
        {t("history.emptyTitle")}
      </h2>
      <p className="text-muted-foreground mx-auto mt-2.5 max-w-[440px] text-[14px] leading-[1.55]">
        {t("history.emptyDesc", { phrase: ON_DEVICE_PHRASE })}
      </p>
    </div>
  );
}

function NoSearchResults({
  hasSearch,
  hasDates,
  onClear,
}: {
  hasSearch: boolean;
  hasDates: boolean;
  onClear: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="border-border bg-card/30 mt-4 rounded-[14px] border border-dashed px-9 py-12 text-center">
      <div className="text-muted-foreground mb-3">
        <span className="serif-italic text-[20px]">
          {hasSearch && hasDates
            ? t("history.noResultsBoth")
            : hasSearch
              ? t("history.noResultsSearch")
              : t("history.noResultsDates")}
        </span>
      </div>
      {(hasSearch || hasDates) && (
        <Button
          variant="link"
          onClick={onClear}
          className="h-auto p-0 text-xs font-semibold underline"
        >
          {hasSearch && hasDates
            ? t("history.clearBoth")
            : hasSearch
              ? t("history.clearSearch")
              : t("history.clearFilters")}
        </Button>
      )}
    </div>
  );
}
