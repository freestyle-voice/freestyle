import {
  DEFAULT_HISTORY_FILTERS,
  type HistoryFiltersSetting,
  type HistoryPreset,
  parseHistoryFilters,
} from "@freestyle-voice/validations";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@renderer/components/ui/popover";
import { Switch } from "@renderer/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import { usePersistentJsonState } from "@renderer/hooks/use-persistent-state";
import { getClient } from "@renderer/lib/api";
import { type DiffSegment, diffWords } from "@renderer/lib/history-diff";
import { SEARCH_SHORTCUT_LABEL } from "@renderer/lib/platform";
import { cn, ON_DEVICE_PHRASE } from "@renderer/lib/utils";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Eraser,
  FileDiff,
  Filter,
  FlaskConical,
  PanelRight,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { type DateRange, DayPicker } from "react-day-picker";
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

function parseLocalDate(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatRangeDate(value: string): string {
  if (!value) return "Select";
  const date = parseLocalDate(value);
  if (!date) return "Select";
  const day = date.getDate();
  const month = date.toLocaleDateString(undefined, { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month}, ${year}`;
}

function formatRangeLabel(start: string, end: string): string {
  return `${formatRangeDate(start)} - ${formatRangeDate(end)}`;
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
const DEV_HISTORY_SEED_ENABLED = import.meta.env.DEV;

export default function HistoryPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  // ── Persisted filter + view state ──────────────────────────────────────
  // Date range and view toggles are UI-only preferences, so — like each page's
  // active tab — they live in localStorage rather than the server settings
  // store. `usePersistentJsonState` reads them synchronously on mount, so they
  // survive navigation and app restarts with no fetch round-trip. Diff mode and
  // AI-edit visibility are global toggles applied to every entry at once
  // (driven from the filter panel) rather than per-card state.
  const [filters, setFilters] = usePersistentJsonState(
    "history.filters",
    DEFAULT_HISTORY_FILTERS,
    parseHistoryFilters,
  );
  const {
    preset: activePreset,
    customStartDate,
    customEndDate,
    filterOpen,
    diffMode,
    showAiEdits,
    nerdMode,
  } = filters;

  // Merge a partial change into the persisted filter blob.
  const patchFilters = useCallback(
    (patch: Partial<HistoryFiltersSetting>) =>
      setFilters((prev) => ({ ...prev, ...patch })),
    [setFilters],
  );

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

  const getTimeLabel = (): string => {
    if (activePreset === "weekly") return t("history.timeLabelPast7");
    if (activePreset === "today") return t("history.timeLabelToday");
    if (activePreset === "monthly") return t("history.timeLabelPast30");
    if (activePreset === "all-time") return t("history.timeLabelAllTime");
    return t("history.timeLabelFiltered");
  };
  const timeLabel = getTimeLabel();

  const filterCount = activePreset !== "all-time" ? 1 : 0;

  const applyPreset = useCallback(
    (preset: HistoryPreset): void => {
      patchFilters({ preset });
      setPage(0);
    },
    [patchFilters],
  );

  const selectDateRange = useCallback(
    (range: DateRange | undefined): void => {
      patchFilters({
        preset: "custom",
        customStartDate: range?.from ? getLocalDateString(range.from) : "",
        customEndDate: range?.to ? getLocalDateString(range.to) : "",
      });
      setPage(0);
    },
    [patchFilters],
  );

  // Restore the page's initial defaults (not "all time"). Leaves the panel's
  // open/closed state untouched so the panel doesn't collapse out from under
  // the click.
  const resetFilters = useCallback((): void => {
    setFilters((prev) => ({
      ...DEFAULT_HISTORY_FILTERS,
      filterOpen: prev.filterOpen,
    }));
    setPage(0);
  }, [setFilters]);

  const closeFilter = useCallback(
    () => patchFilters({ filterOpen: false }),
    [patchFilters],
  );

  // Stable setters for the filter panel's view toggles (memoized child).
  const setDiffMode = useCallback(
    (value: boolean) => patchFilters({ diffMode: value }),
    [patchFilters],
  );
  const setShowAiEdits = useCallback(
    (value: boolean) => patchFilters({ showAiEdits: value }),
    [patchFilters],
  );
  const setNerdMode = useCallback(
    (value: boolean) => patchFilters({ nerdMode: value }),
    [patchFilters],
  );

  const queryClient = useQueryClient();

  const { data: historyData, isLoading: loading } = useQuery({
    queryKey: ["history", page, search, startDate, endDate],
    queryFn: async () => {
      const q: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        orderBy: "-created_at",
      };
      if (search) q.search = search;
      if (startDate) q.start_date = startDate;
      if (endDate) q.end_date = endDate;

      const statsQ: Record<string, string> = {};
      if (startDate) statsQ.start_date = startDate;
      if (endDate) statsQ.end_date = endDate;

      const client = getClient();
      const [histRes, statsRes] = await Promise.all([
        client.api.history.$get({ query: q }),
        client.api.history.stats.$get({ query: statsQ }),
      ]);
      const items = histRes.ok
        ? ((await histRes.json()) as { items: HistoryEntry[]; total: number })
        : { items: [] as HistoryEntry[], total: 0 };
      const statsData = statsRes.ok ? ((await statsRes.json()) as Stats) : null;
      return { ...items, stats: statsData };
    },
    // Keep showing the previous results while a new filter/page/search query
    // loads. Without this every filter change is a brand-new query key with no
    // cache, so `isLoading` flips true and the whole page blanks to the loading
    // spinner — the "page re-renders" flash.
    placeholderData: keepPreviousData,
  });

  const apiEntries = historyData?.items ?? [];
  const devSeedEntry = useMemo<HistoryEntry | null>(() => {
    if (!DEV_HISTORY_SEED_ENABLED) return null;
    if (search && !"inline filter panel visual test".includes(search)) {
      return null;
    }
    if (startDate && todayStr < startDate) return null;
    if (endDate && todayStr > endDate) return null;

    return {
      id: -419,
      raw_text: "Inline filter panel visual test.",
      cleaned_text:
        "Inline filter panel visual test entry for reviewing the History layout.",
      voice_provider: "dev-seed",
      voice_model: "dev-seed/local",
      llm_provider: "dev-seed",
      llm_model: "dev-seed/cleanup",
      duration_ms: 640,
      audio_duration_ms: 3200,
      input_tokens: 18,
      output_tokens: 12,
      cost_usd: 0,
      created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
    };
  }, [endDate, search, startDate, todayStr]);
  const hasDevSeedEntry = apiEntries.length === 0 && devSeedEntry !== null;
  const entries = hasDevSeedEntry ? [devSeedEntry] : apiEntries;
  const total = hasDevSeedEntry ? 1 : (historyData?.total ?? 0);
  const stats = hasDevSeedEntry
    ? {
        total_sessions: 1,
        total_duration_ms: 640,
        total_input_tokens: 18,
        total_output_tokens: 12,
        total_cost_usd: 0,
        avg_duration_ms: 640,
        total_words: 12,
        today_sessions: 1,
        today_cost: 0,
        unfiltered_total_sessions: 1,
      }
    : (historyData?.stats ?? null);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: historyPausedData } = useQuery({
    queryKey: ["setting", SETTINGS_KEYS.historyPaused],
    queryFn: async () => {
      const res = await getClient().api.settings[":key"].$get({
        param: { key: SETTINGS_KEYS.historyPaused },
      });
      const data = res.ok ? await res.json() : null;
      return data?.value === "true";
    },
  });
  const historyPaused = historyPausedData ?? false;

  // Refetch when the pill reports a completed transcription.
  useEffect(() => {
    const remove = window.api?.onTranscriptionDone(() => {
      void queryClient.invalidateQueries({ queryKey: ["history"] });
    });
    return () => remove?.();
  }, [queryClient]);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["history"] }),
    [queryClient],
  );

  const deleteEntry = useCallback(
    async (id: number) => {
      await getClient().api.history[":id"].$delete({
        param: { id: String(id) },
      });
      void invalidate();
    },
    [invalidate],
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
            // When the filter panel is open it should sit flush against the
            // window's right and bottom edges, so drop the page's right and
            // bottom padding here — the bottom padding is re-applied to just
            // the feed column so its divider line still runs edge-to-edge.
            ...(filterOpen ? { paddingRight: 0, paddingBottom: 0 } : {}),
          } as React.CSSProperties
        }
      >
        <PageHeader title={t("history.title")} />

        {historyPaused && <HistoryPausedNotice />}

        {isGenuineEmpty ? (
          <EmptyState />
        ) : (
          <div
            className={cn(
              "grid min-w-0 gap-7",
              filterOpen &&
                "min-h-[calc(100vh-88px)] grid-cols-[minmax(0,1fr)_minmax(300px,340px)] gap-5",
            )}
          >
            <div className={cn("min-w-0", filterOpen && "pb-12")}>
              {/* Stats */}
              <div
                className={cn(
                  "border-border mb-7 grid grid-cols-2 gap-2.5 border-b pb-7",
                  !filterOpen &&
                    (nerdMode ? "md:grid-cols-3" : "md:grid-cols-4"),
                )}
              >
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
                {nerdMode && (
                  <>
                    <Stat
                      n={(stats?.total_input_tokens ?? 0).toLocaleString()}
                      l={t("history.tokensInStat")}
                    />
                    <Stat
                      n={(stats?.total_output_tokens ?? 0).toLocaleString()}
                      l={t("history.tokensOutStat")}
                    />
                  </>
                )}
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
                    {SEARCH_SHORTCUT_LABEL}
                  </span>
                </div>
                {!filterOpen && (
                  <Button
                    variant="outline"
                    onClick={() => patchFilters({ filterOpen: true })}
                    className={cn(
                      "text-muted-foreground h-auto self-stretch",
                      filterCount > 0 &&
                        "border-primary text-primary bg-primary/5",
                    )}
                    aria-expanded={filterOpen}
                  >
                    <Filter data-icon="inline-start" />
                    <span>{t("history.filtersBtn")}</span>
                    {filterCount > 0 && (
                      <Badge className="h-4 min-w-4 px-1 text-[9px] font-bold">
                        {filterCount}
                      </Badge>
                    )}
                  </Button>
                )}
              </div>

              {entries.length === 0 ? (
                <NoSearchResults
                  hasSearch={!!search}
                  hasDates={activePreset !== "all-time"}
                  onClear={() => {
                    setSearch("");
                    patchFilters({
                      preset: "all-time",
                      customStartDate: "",
                      customEndDate: "",
                    });
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
                          diffMode={diffMode}
                          showAiEdits={showAiEdits}
                          nerdMode={nerdMode}
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
            </div>

            {filterOpen && (
              <FilterPanel
                activePreset={activePreset}
                startDate={startDate}
                endDate={endDate}
                diffMode={diffMode}
                showAiEdits={showAiEdits}
                nerdMode={nerdMode}
                onPreset={applyPreset}
                onSelectRange={selectDateRange}
                onReset={resetFilters}
                onClose={closeFilter}
                onDiffModeChange={setDiffMode}
                onShowAiEditsChange={setShowAiEdits}
                onNerdModeChange={setNerdMode}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

const PRESETS: { value: HistoryPreset; labelKey: string }[] = [
  { value: "today", labelKey: "history.presetToday" },
  { value: "weekly", labelKey: "history.presetLast7" },
  { value: "monthly", labelKey: "history.presetLast30" },
  { value: "all-time", labelKey: "history.presetAllTime" },
];

/**
 * The History filter sidebar. Memoized so it doesn't re-render on unrelated
 * page state changes (search typing, pagination, data refetches). All handlers
 * are stabilized by the parent with `useCallback`.
 */
const FilterPanel = memo(function FilterPanel({
  activePreset,
  startDate,
  endDate,
  diffMode,
  showAiEdits,
  nerdMode,
  onPreset,
  onSelectRange,
  onReset,
  onClose,
  onDiffModeChange,
  onShowAiEditsChange,
  onNerdModeChange,
}: {
  activePreset: HistoryPreset;
  startDate: string;
  endDate: string;
  diffMode: boolean;
  showAiEdits: boolean;
  nerdMode: boolean;
  onPreset: (preset: HistoryPreset) => void;
  onSelectRange: (range: DateRange | undefined) => void;
  onReset: () => void;
  onClose: () => void;
  onDiffModeChange: (value: boolean) => void;
  onShowAiEditsChange: (value: boolean) => void;
  onNerdModeChange: (value: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const selectedDateRange: DateRange = {
    from: parseLocalDate(startDate),
    to: parseLocalDate(endDate),
  };

  return (
    // Wrapper stretches to the full height of the feed column so the divider
    // line runs edge-to-edge; the panel itself stays sticky within it.
    <div className="border-border/70 border-l">
      <aside className="bg-background/25 sticky top-0 flex h-[calc(100vh-88px)] min-h-[520px] flex-col overflow-hidden px-4 py-4 shadow-[-12px_0_28px_-28px_var(--glass-shadow)] animate-in fade-in-0 slide-in-from-right-3 duration-200">
        <div className="border-border/70 flex h-10 items-center gap-1.5 border-b pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-foreground text-[14px] font-semibold">
              {t("history.filterTitle")}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onReset}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            aria-label={t("history.reset")}
            title={t("history.reset")}
          >
            <Eraser />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close filters"
            title="Close filters"
          >
            <PanelRight />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto pt-4 pr-1">
          {/* Date range */}
          <div className="flex flex-col gap-2.5">
            <Label className="mono text-muted-foreground text-[10px] uppercase tracking-wider">
              {t("history.dateRangeLabel")}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="border-border/75 bg-card/45 hover:bg-card/60 h-9 w-full justify-start gap-2 px-3 text-left text-[13px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                >
                  <CalendarDays data-icon="inline-start" />
                  <span className="truncate">
                    {formatRangeLabel(startDate, endDate)}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[320px] translate-x-2 overflow-visible p-2"
                collisionPadding={8}
                sideOffset={6}
              >
                <DayPicker
                  mode="range"
                  numberOfMonths={2}
                  selected={selectedDateRange}
                  onSelect={onSelectRange}
                  defaultMonth={selectedDateRange.from ?? selectedDateRange.to}
                  classNames={{
                    root: "p-0",
                    months: "flex gap-3",
                    month: "flex flex-col gap-2",
                    month_caption: "flex h-6 items-center justify-center",
                    caption_label: "text-[12px] font-medium text-foreground",
                    nav: "absolute inset-x-2 top-2 flex items-center justify-between",
                    button_previous:
                      "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
                    button_next:
                      "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
                    chevron: "size-3.5 fill-current",
                    month_grid: "w-full border-collapse border-spacing-0",
                    weekdays: "flex",
                    weekday:
                      "text-muted-foreground flex size-5 items-center justify-center text-[9px] font-normal",
                    week: "flex w-full",
                    day: "relative flex size-5 items-center justify-center p-0 text-center text-[10px]",
                    day_button:
                      "relative z-10 inline-flex size-5 items-center justify-center rounded transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    outside: "text-muted-foreground/45",
                    today:
                      "after:bg-primary after:absolute after:bottom-1 after:left-1/2 after:z-20 after:size-1 after:-translate-x-1/2 after:rounded-full",
                    selected:
                      "text-primary-foreground after:!hidden [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
                    range_start:
                      "bg-primary/15 rounded-l-md [&>button]:rounded-l [&>button]:rounded-r-none",
                    range_middle:
                      "bg-primary/15 [&>button]:rounded-none [&>button]:!bg-transparent [&>button]:!text-foreground [&>button]:hover:!bg-transparent",
                    range_end:
                      "bg-primary/15 rounded-r-md [&>button]:rounded-r [&>button]:rounded-l-none",
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Presets — plain buttons, active one is always highlighted */}
          <div className="flex flex-col gap-2.5">
            <span className="mono text-muted-foreground text-[10px] uppercase tracking-wider">
              {t("history.presetsLabel")}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((preset) => {
                const active = activePreset === preset.value;
                return (
                  <Button
                    key={preset.value}
                    variant={active ? "default" : "outline"}
                    size="sm"
                    className="h-8 w-full justify-center text-[11px]"
                    aria-pressed={active}
                    onClick={() => onPreset(preset.value)}
                  >
                    {t(preset.labelKey)}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* View — global toggles that apply to every entry at once */}
          <div className="flex flex-col gap-2.5">
            <span className="mono text-muted-foreground text-[10px] uppercase tracking-wider">
              {t("history.viewLabel")}
            </span>
            <div className="border-border/70 bg-card/35 flex flex-col divide-y divide-border/60 rounded-lg border">
              <ViewToggleRow
                icon={
                  <FileDiff className="text-muted-foreground h-3.5 w-3.5" />
                }
                title={t("history.diffToggle")}
                description={t("history.diffToggleDesc")}
                checked={diffMode}
                onCheckedChange={onDiffModeChange}
              />
              <ViewToggleRow
                icon={
                  <Sparkles className="text-muted-foreground h-3.5 w-3.5" />
                }
                title={t("history.aiEditToggle")}
                description={t("history.aiEditToggleDesc")}
                checked={showAiEdits}
                // Diff mode already shows both raw and cleaned, so the plain
                // AI-edit toggle is moot while diff mode is on.
                disabled={diffMode}
                onCheckedChange={onShowAiEditsChange}
              />
              <ViewToggleRow
                icon={
                  <FlaskConical className="text-muted-foreground h-3.5 w-3.5" />
                }
                title={t("history.nerdToggle")}
                description={t("history.nerdToggleDesc")}
                checked={nerdMode}
                onCheckedChange={onNerdModeChange}
              />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
});

function ViewToggleRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5",
        disabled && "opacity-50",
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-foreground text-[12px] font-medium">{title}</div>
        <div className="text-muted-foreground text-[10.5px] leading-snug">
          {description}
        </div>
      </div>
      <Switch
        size="sm"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={title}
      />
    </div>
  );
}

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

const FeedItem = memo(function FeedItem({
  entry,
  onDelete,
  diffMode,
  showAiEdits,
  nerdMode,
}: {
  entry: HistoryEntry;
  onDelete: (id: number) => void;
  // Global view toggles driven from the filter panel.
  diffMode: boolean;
  showAiEdits: boolean;
  nerdMode: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const hasAiEdit =
    !!entry.cleaned_text && entry.cleaned_text.trim() !== entry.raw_text.trim();
  const showDiff = diffMode && hasAiEdit;
  const showCleaned = showAiEdits && hasAiEdit;
  const text =
    showCleaned && entry.cleaned_text ? entry.cleaned_text : entry.raw_text;
  const diff = useMemo(
    () =>
      showDiff && entry.cleaned_text
        ? diffWords(entry.raw_text, entry.cleaned_text)
        : null,
    [showDiff, entry.raw_text, entry.cleaned_text],
  );
  const voice = shortModel(entry.voice_model) || entry.voice_provider;
  const llm = shortModel(entry.llm_model);
  // In nerd mode, qualify each model with its provider (STT and post-process),
  // shown right in the header label rather than in a separate line below. The
  // post-process provider is only prefixed when it differs from the STT
  // provider — otherwise it's the same string repeated, so we drop it.
  const voiceLabel =
    nerdMode && entry.voice_provider
      ? `${entry.voice_provider}/${voice}`
      : voice;
  const llmLabel =
    llm &&
    nerdMode &&
    entry.llm_provider &&
    entry.llm_provider !== entry.voice_provider
      ? `${entry.llm_provider}/${llm}`
      : llm;
  const modelLabel = llmLabel ? `${voiceLabel} · ${llmLabel}` : voiceLabel;

  // "Stats for nerds" — surface the data we store but normally hide.
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const wpm =
    entry.audio_duration_ms > 0
      ? Math.round(wordCount / (entry.audio_duration_ms / 60000))
      : null;
  const hasTokens = entry.input_tokens > 0 || entry.output_tokens > 0;

  const copyText = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <div className="group px-1.5 py-3.5">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="mono text-foreground shrink-0 text-[11px] font-medium tracking-[0.04em]">
          {formatClock(entry.created_at)}
        </span>
        <span className="bg-muted-foreground/50 h-[3px] w-[3px] shrink-0 rounded-full" />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="mono text-primary min-w-0 flex-1 cursor-default truncate text-[10.5px] font-semibold uppercase tracking-[0.12em]">
              {modelLabel}
            </span>
          </TooltipTrigger>
          <TooltipContent>{modelLabel}</TooltipContent>
        </Tooltip>
        {/* Copy/delete sit before the duration so the actions don't leave a
            reserved blank at the far-right edge when not hovering. */}
        <div className="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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
        <span className="mono text-muted-foreground shrink-0 text-[10px] tracking-[0.06em]">
          {formatSeconds(entry.audio_duration_ms || entry.duration_ms)}
        </span>
        {entry.cost_usd > 0 && (
          <span className="mono text-muted-foreground shrink-0 text-[10px]">
            · {formatCost(entry.cost_usd)}
          </span>
        )}
      </div>
      <p
        className="text-foreground m-0 text-[16px] leading-[1.55]"
        style={{ textWrap: "pretty" as never }}
        dir="auto"
      >
        “{diff ? <DiffText segments={diff} /> : text}”
      </p>
      {nerdMode && (
        <div className="mono text-muted-foreground/80 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] tracking-[0.04em]">
          <span>
            {t("history.nerdCompute", {
              label: formatSeconds(entry.duration_ms),
            })}
          </span>
          {wpm !== null && <span>· {t("history.nerdWpm", { n: wpm })}</span>}
          {hasTokens && (
            <span>
              ·{" "}
              {t("history.nerdTok", {
                in: entry.input_tokens,
                out: entry.output_tokens,
              })}
            </span>
          )}
          <span>· {formatCost(entry.cost_usd)}</span>
        </div>
      )}
    </div>
  );
});

/**
 * Inline rendering of a raw→cleaned diff: words the post-processing removed
 * are struck through, words it added are highlighted. Unchanged words render
 * plainly, so both outputs are visible in a single reading pass.
 */
function DiffText({
  segments,
}: {
  segments: DiffSegment[];
}): React.JSX.Element {
  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.type === "same") return seg.text;
        // Keep the segment's trailing whitespace outside the styled span so
        // the strikethrough/background doesn't bleed into the gap after it.
        const content = seg.text.trimEnd();
        const trailing = seg.text.slice(content.length);
        return seg.type === "del" ? (
          <span key={idx}>
            <del className="text-destructive bg-destructive/10 decoration-destructive/60 rounded-[3px]">
              {content}
            </del>
            {trailing}
          </span>
        ) : (
          <span key={idx}>
            <ins className="text-primary bg-primary/10 rounded-[3px] no-underline">
              {content}
            </ins>
            {trailing}
          </span>
        );
      })}
    </>
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
