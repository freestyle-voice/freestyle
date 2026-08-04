import {
  DEFAULT_HISTORY_FILTERS,
  type HistoryFiltersSetting,
  KNOWN_NOTIFICATION_KEYS,
  parseHistoryFilters,
} from "@freestyle-voice/validations";
import { DragSpacer } from "@renderer/components/drag-spacer";
import { TutorialDemo } from "@renderer/components/tutorial-demo";
import { Button } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
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
import { useDismissible } from "@renderer/hooks/use-dismissible";
import {
  usePersistentJsonState,
  usePersistentState,
} from "@renderer/hooks/use-persistent-state";
import { getClient } from "@renderer/lib/api";
import { formatNumber } from "@renderer/lib/format";
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
  FileDiff,
  FlaskConical,
  GraduationCap,
  PanelRight,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  total_audio_ms: number;
  total_fixes: number;
  total_words: number;
  today_sessions: number;
  today_cost: number;
  unfiltered_total_sessions: number;
}

/** One local day of usage from GET /api/history/daily, feeding the heatmap. */
interface DayActivity {
  day: string;
  words: number;
  sessions: number;
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
const STATS_WIDTH_MIN = 260;
const STATS_WIDTH_MAX = 480;

export default function HistoryPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  // The filter dialog is transient UI, not persisted state.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Keep the legacy localStorage flag as a synchronous compatibility mirror:
  // it prevents a flash for users who dismissed the hero before the SQLite
  // store existed and preserves their choice if the migration PUT fails.
  const [legacyHeroDismissed, setLegacyHeroDismissed] = usePersistentState<
    "0" | "1"
  >(
    "today.heroDismissed",
    "0",
    (value): value is "0" | "1" => value === "0" || value === "1",
  );
  const {
    dismissed: storedHeroDismissed,
    dismiss: persistHeroDismissal,
    reset: resetStoredHeroDismissal,
    ready: heroReady,
  } = useDismissible(KNOWN_NOTIFICATION_KEYS.TODAY_TUTORIAL_HERO);
  const heroDismissed = storedHeroDismissed || legacyHeroDismissed === "1";
  const migrationAttemptedRef = useRef(false);

  // Best-effort one-time migration per mount. The legacy mirror is deliberately
  // retained until the user explicitly resets the tutorial; if this PUT fails,
  // the old dismissal still survives and migration retries next app launch.
  useEffect(() => {
    if (
      !heroReady ||
      storedHeroDismissed ||
      legacyHeroDismissed !== "1" ||
      migrationAttemptedRef.current
    ) {
      return;
    }
    migrationAttemptedRef.current = true;
    persistHeroDismissal();
  }, [
    heroReady,
    storedHeroDismissed,
    legacyHeroDismissed,
    persistHeroDismissal,
  ]);

  const dismissHero = useCallback(() => {
    setLegacyHeroDismissed("1");
    persistHeroDismissal();
  }, [persistHeroDismissal, setLegacyHeroDismissed]);

  const resetHero = useCallback(() => {
    setLegacyHeroDismissed("0");
    resetStoredHeroDismissal();
  }, [resetStoredHeroDismissal, setLegacyHeroDismissed]);

  const setShowTutorial = useCallback(
    (value: boolean) => {
      if (value) resetHero();
      else dismissHero();
    },
    [dismissHero, resetHero],
  );

  // Stats sidebar visibility and width. Open by default, collapsible, and
  // resizable by dragging its left edge; both persisted across sessions.
  const [statsOpenRaw, setStatsOpenRaw] = usePersistentState<"0" | "1">(
    "today.statsOpen",
    "1",
    (v): v is "0" | "1" => v === "0" || v === "1",
  );
  const statsOpen = statsOpenRaw === "1";
  const openStats = useCallback(() => setStatsOpenRaw("1"), [setStatsOpenRaw]);
  const closeStats = useCallback(() => setStatsOpenRaw("0"), [setStatsOpenRaw]);
  const [statsWidthRaw, setStatsWidthRaw] = usePersistentState<string>(
    "today.statsWidth",
    "320",
    (v): v is string => /^\d+$/.test(v),
  );
  const statsWidth = Math.min(
    STATS_WIDTH_MAX,
    Math.max(STATS_WIDTH_MIN, Number(statsWidthRaw) || 320),
  );
  const setStatsWidth = useCallback(
    (w: number) =>
      setStatsWidthRaw(
        String(Math.min(STATS_WIDTH_MAX, Math.max(STATS_WIDTH_MIN, w))),
      ),
    [setStatsWidthRaw],
  );
  // The panel sits flush against the window's right edge, so its width is
  // simply the distance from the pointer to that edge, clamped.
  const onResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const onMove = (ev: PointerEvent): void => {
        setStatsWidth(Math.round(window.innerWidth - ev.clientX));
      };
      const onUp = (ev: PointerEvent): void => {
        el.releasePointerCapture(ev.pointerId);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
    },
    [setStatsWidth],
  );

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

  const todayStr = getLocalDateString(new Date());

  // Presets are gone: the only date filter is an explicit custom range.
  // Legacy persisted presets (today/weekly/monthly) are treated as all-time.
  const hasCustomRange =
    activePreset === "custom" && !!(customStartDate || customEndDate);
  const startDate = hasCustomRange ? customStartDate : "";
  const endDate = hasCustomRange ? customEndDate : "";

  const timeLabel = hasCustomRange
    ? t("history.timeLabelFiltered")
    : t("history.timeLabelAllTime");

  const filterCount = hasCustomRange ? 1 : 0;

  const selectDateRange = useCallback(
    (range: DateRange | undefined): void => {
      patchFilters({
        preset: range ? "custom" : "all-time",
        customStartDate: range?.from ? getLocalDateString(range.from) : "",
        customEndDate: range?.to ? getLocalDateString(range.to) : "",
      });
      setPage(0);
    },
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
        total_audio_ms: 3200,
        total_fixes: 3,
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

  // Per-day usage for the heatmap. Fixed lookback window on the server, so it
  // ignores the list filters; shares the "history" key prefix so a completed
  // transcription invalidates it along with the feed.
  const { data: dailyData } = useQuery({
    queryKey: ["history", "daily"],
    queryFn: async () => {
      const res = await getClient().api.history.daily.$get();
      if (!res.ok) return [] as DayActivity[];
      const data = (await res.json()) as { days: DayActivity[] };
      return data.days;
    },
  });

  // Refetch when the pill reports a completed transcription.
  useEffect(() => {
    const remove = window.api?.onTranscriptionDone(() => {
      void queryClient.invalidateQueries({ queryKey: ["history"] });
    });
    return () => remove?.();
  }, [queryClient]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchShortcutEnabled = total > 0 || !!search;

  useEffect(() => {
    if (!searchShortcutEnabled) return;

    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      const input = searchInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchShortcutEnabled]);

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

  // Overall speaking speed for the active date range, from the server
  // aggregates (words over spoken-audio minutes).
  const avgWpm =
    stats && stats.total_audio_ms > 0
      ? Math.round(stats.total_words / (stats.total_audio_ms / 60000))
      : 0;

  // Heatmap series. With the dev seed active there's no real history, so
  // synthesize a deterministic few months to make the heatmap reviewable.
  const daily = useMemo<DayActivity[]>(() => {
    if (!hasDevSeedEntry) return dailyData ?? [];
    const out: DayActivity[] = [];
    const d = new Date();
    for (let i = 0; i < 112; i++) {
      const words = (i * 37) % 7 === 0 ? 0 : 40 + ((i * 53) % 360);
      if (words > 0) {
        out.push({
          day: getLocalDateString(d),
          words,
          sessions: 1 + (i % 3),
        });
      }
      d.setDate(d.getDate() - 1);
    }
    return out;
  }, [dailyData, hasDevSeedEntry]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">{t("history.loading")}</p>
      </div>
    );
  }

  const isGenuineEmpty = stats?.unfiltered_total_sessions === 0;

  const hero = heroReady && !heroDismissed && !isGenuineEmpty && (
    <div className="relative mb-7">
      <button
        type="button"
        onClick={dismissHero}
        aria-label={t("history.dismissHero")}
        title={t("history.dismissHero")}
        className="text-muted-foreground hover:bg-card hover:text-foreground absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <TutorialDemo />
      <div className="mt-2 flex justify-end">
        <Link
          to="/settings#recording"
          className="text-muted-foreground hover:text-foreground px-2 text-[12px] underline transition-colors"
        >
          {t("history.changeHotkey")}
        </Link>
      </div>
    </div>
  );

  const searchRow = (
    <div className="mb-6 flex gap-2">
      <div className="border-border bg-card flex flex-1 items-center gap-2 rounded-lg border px-3 py-2">
        <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        <input
          ref={searchInputRef}
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
        <span className="text-muted-foreground text-[10px]">
          {SEARCH_SHORTCUT_LABEL}
        </span>
      </div>
      <Button
        variant="link"
        onClick={() => setFiltersOpen(true)}
        className={cn(
          "h-auto self-center px-2 text-[13px] underline",
          filterCount > 0
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {t("history.filtersBtn")}
      </Button>
      {!statsOpen && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="self-center"
          onClick={openStats}
          aria-label={t("history.openStats")}
          title={t("history.openStats")}
        >
          <PanelRight />
        </Button>
      )}
    </div>
  );

  const feed =
    entries.length === 0 ? (
      <NoSearchResults
        hasSearch={!!search}
        hasDates={hasCustomRange}
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
    );

  const pagination = total > PAGE_SIZE && (
    <div className="border-border mt-4 flex items-center justify-between border-t pt-4">
      <span className="text-muted-foreground text-[11px]">
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
        <span className="text-muted-foreground px-2 text-[11px]">
          {page + 1} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );

  const filtersModal = (
    <FiltersModal
      open={filtersOpen}
      onOpenChange={setFiltersOpen}
      startDate={startDate}
      endDate={endDate}
      diffMode={diffMode}
      showAiEdits={showAiEdits}
      nerdMode={nerdMode}
      showTutorial={heroReady && !heroDismissed}
      onSelectRange={selectDateRange}
      onDiffModeChange={setDiffMode}
      onShowAiEditsChange={setShowAiEdits}
      onNerdModeChange={setNerdMode}
      onShowTutorialChange={setShowTutorial}
    />
  );

  if (isGenuineEmpty) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <DragSpacer />
        <div
          className="responsive-page-scroll flex-1 overflow-auto pt-5"
          style={{ scrollbarWidth: "none" } as React.CSSProperties}
        >
          {historyPaused && <HistoryPausedNotice />}
          {hero}
          <EmptyState />
        </div>
      </div>
    );
  }

  // Split layout: a scrollable feed column beside the collapsible, resizable
  // stats panel. The DragSpacer stays at the top; the feed column owns its own
  // scroll so the panel never scrolls out of view.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DragSpacer />
      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: statsOpen
            ? `minmax(0,1fr) ${statsWidth}px`
            : "minmax(0,1fr)",
        }}
      >
        <div
          className="responsive-page-scroll min-w-0 overflow-auto pt-5"
          style={
            {
              scrollbarWidth: "none",
              paddingRight: statsOpen ? "1.25rem" : undefined,
            } as React.CSSProperties
          }
        >
          {historyPaused && <HistoryPausedNotice />}
          {hero}
          {searchRow}
          {feed}
          {pagination}
        </div>
        {statsOpen && (
          <StatsPanel
            stats={stats}
            timeLabel={timeLabel}
            daily={daily}
            avgWpm={avgWpm}
            width={statsWidth}
            onClose={closeStats}
            onResizeStart={onResizeStart}
            onWidthChange={setStatsWidth}
          />
        )}
      </div>
      {filtersModal}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * The right-hand stats panel: collapsible via its header button and resizable
 * by dragging its left edge. Memoized so it doesn't re-render on unrelated
 * page state (search typing, pagination).
 */
const StatsPanel = memo(function StatsPanel({
  stats,
  timeLabel,
  daily,
  avgWpm,
  width,
  onClose,
  onResizeStart,
  onWidthChange,
}: {
  stats: Stats | null;
  timeLabel: string;
  daily: DayActivity[];
  avgWpm: number;
  width: number;
  onClose: () => void;
  onResizeStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  onWidthChange: (width: number) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    // Fills the full height of its grid cell and stays fixed while the feed
    // column scrolls independently beside it.
    <div className="border-border/70 relative min-h-0 border-l">
      {/* Invisible drag handle straddling the panel's left border. Focusable
          window-splitter: arrow keys nudge the width for keyboard users. */}
      {/* biome-ignore lint/a11y/useSemanticElements: an <hr> can't act as a focusable, draggable window splitter */}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={t("history.resizeStats")}
        aria-valuenow={width}
        aria-valuemin={STATS_WIDTH_MIN}
        aria-valuemax={STATS_WIDTH_MAX}
        onPointerDown={onResizeStart}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            onWidthChange(width + 16);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            onWidthChange(width - 16);
          }
        }}
        className="hover:bg-primary/25 active:bg-primary/40 focus-visible:bg-primary/25 absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize transition-colors outline-none"
      />
      <aside className="flex h-full min-h-0 flex-col overflow-hidden px-4 py-4 shadow-[-12px_0_28px_-28px_var(--glass-shadow)]">
        <div className="-mr-1.5 flex justify-end">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label={t("history.closeStats")}
            title={t("history.closeStats")}
          >
            <PanelRight />
          </Button>
        </div>
        <StatsTab
          stats={stats}
          timeLabel={timeLabel}
          daily={daily}
          avgWpm={avgWpm}
        />
      </aside>
    </div>
  );
});

/** Date-range + view options, presented as a modal dialog. */
const FiltersModal = memo(function FiltersModal({
  open,
  onOpenChange,
  startDate,
  endDate,
  diffMode,
  showAiEdits,
  nerdMode,
  showTutorial,
  onSelectRange,
  onDiffModeChange,
  onShowAiEditsChange,
  onNerdModeChange,
  onShowTutorialChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: string;
  endDate: string;
  diffMode: boolean;
  showAiEdits: boolean;
  nerdMode: boolean;
  showTutorial: boolean;
  onSelectRange: (range: DateRange | undefined) => void;
  onDiffModeChange: (value: boolean) => void;
  onShowAiEditsChange: (value: boolean) => void;
  onNerdModeChange: (value: boolean) => void;
  onShowTutorialChange: (value: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const selectedDateRange: DateRange = {
    from: parseLocalDate(startDate),
    to: parseLocalDate(endDate),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t("history.filterTitle")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Date range */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-[12px]">
                {t("history.dateRangeLabel")}
              </Label>
              {(startDate || endDate) && (
                <Button
                  variant="link"
                  size="xs"
                  className="text-muted-foreground hover:text-foreground h-auto p-0 text-[11px] underline"
                  onClick={() => onSelectRange(undefined)}
                >
                  {t("history.clearDates")}
                </Button>
              )}
            </div>
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
                align="start"
                className="w-[320px] overflow-visible p-2"
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

          {/* View — global toggles that apply to every entry at once */}
          <div className="flex flex-col gap-2.5">
            <span className="text-muted-foreground text-[10px]">
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
              <ViewToggleRow
                icon={
                  <GraduationCap className="text-muted-foreground h-3.5 w-3.5" />
                }
                title={t("history.tutorialToggle")}
                description={t("history.tutorialToggleDesc")}
                checked={showTutorial}
                onCheckedChange={onShowTutorialChange}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ink" onClick={() => onOpenChange(false)}>
            {t("history.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

/** Aggregate stats + visualisations for the active date range. */
function StatsTab({
  stats,
  timeLabel,
  daily,
  avgWpm,
}: {
  stats: Stats | null;
  timeLabel: string;
  daily: DayActivity[];
  avgWpm: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-auto pt-4 pr-1">
      {/* Headline numbers — cards in a 2-up grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          span2
          inline
          accent
          n={formatNumber(avgWpm)}
          l={t("today.wpmLabel")}
          sub={timeLabel}
        />
        <StatCard
          n={formatNumber(stats?.total_words ?? 0)}
          l={t("today.wordsLabel")}
        />
        <StatCard
          n={formatNumber(stats?.total_fixes ?? 0)}
          l={t("today.fixesLabel")}
        />
      </div>

      {/* Daily usage heatmap */}
      <div className="mb-6 flex flex-col gap-2.5">
        <RailLabel>{t("today.dailyActivity")}</RailLabel>
        <DailyHeatmap data={daily} />
      </div>
    </div>
  );
}

function RailLabel({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <div className="text-muted-foreground text-[10px]">{children}</div>;
}

/** A bordered stat card matching the filter panel's card styling. */
function StatCard({
  n,
  l,
  sub,
  accent,
  span2,
  inline,
}: {
  n: string;
  l: string;
  // Optional secondary label rendered below (e.g. the time range).
  sub?: string;
  accent?: boolean;
  // Span both grid columns.
  span2?: boolean;
  // Render the primary label inline (small text) next to the number.
  inline?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "border-border/70 bg-card/35 rounded-lg border px-3.5 py-3",
        span2 && "col-span-2",
      )}
    >
      {inline ? (
        <>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "serif-italic text-[30px] leading-none",
                accent ? "text-primary" : "text-foreground",
              )}
            >
              {n}
            </span>
            <span className="text-muted-foreground text-[9.5px]">{l}</span>
          </div>
          {sub && (
            <div className="text-muted-foreground/70 mt-1.5 text-[9.5px]">
              {sub}
            </div>
          )}
        </>
      ) : (
        <>
          <div
            className={cn(
              "serif-italic text-[30px] leading-none",
              accent ? "text-primary" : "text-foreground",
            )}
          >
            {n}
          </div>
          <div className="text-muted-foreground mt-2 text-[9.5px] leading-tight">
            {l}
          </div>
        </>
      )}
    </div>
  );
}

// Heatmap geometry: GitHub-style week columns, Sunday-start, newest week last.
const HEATMAP_WEEKS = 16;
const HEATMAP_CELL = 11;
const HEATMAP_GAP = 2;
const HEATMAP_PITCH = HEATMAP_CELL + HEATMAP_GAP;
// Word-count intensity steps, low → high, on the olive primary.
const HEATMAP_OPACITIES = [0.25, 0.5, 0.75, 1];

/** GitHub-commit-style heatmap of words dictated per local day. */
function DailyHeatmap({ data }: { data: DayActivity[] }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const byDay = useMemo(
    () => new Map(data.map((d) => [d.day, d.words])),
    [data],
  );
  const max = Math.max(1, ...data.map((d) => d.words));

  const leftPad = 22; // weekday labels
  const topPad = 14; // month labels
  const width = leftPad + HEATMAP_WEEKS * HEATMAP_PITCH - HEATMAP_GAP;
  const height = topPad + 7 * HEATMAP_PITCH - HEATMAP_GAP;

  // First cell = Sunday of the week (HEATMAP_WEEKS - 1) weeks before this one.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const gridStart = new Date(today);
  gridStart.setDate(
    gridStart.getDate() - gridStart.getDay() - (HEATMAP_WEEKS - 1) * 7,
  );

  const cells: React.JSX.Element[] = [];
  const monthLabels: { x: number; label: string }[] = [];
  let prevMonth = -1;
  for (let w = 0; w < HEATMAP_WEEKS; w++) {
    const weekStart = new Date(gridStart);
    weekStart.setDate(gridStart.getDate() + w * 7);
    if (weekStart.getMonth() !== prevMonth) {
      // Drop the previous label when a month boundary lands within two
      // columns of it, so short leading months don't collide.
      const x = leftPad + w * HEATMAP_PITCH;
      const last = monthLabels[monthLabels.length - 1];
      if (last && x - last.x < 3 * HEATMAP_PITCH) monthLabels.pop();
      monthLabels.push({
        x,
        label: weekStart.toLocaleDateString(lang, { month: "short" }),
      });
      prevMonth = weekStart.getMonth();
    }
    for (let d = 0; d < 7; d++) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + w * 7 + d);
      if (date > today) continue;
      const words = byDay.get(getLocalDateString(date)) ?? 0;
      const level = words > 0 ? Math.min(4, Math.ceil((words / max) * 4)) : 0;
      cells.push(
        <rect
          key={`${w}-${d}`}
          x={leftPad + w * HEATMAP_PITCH}
          y={topPad + d * HEATMAP_PITCH}
          width={HEATMAP_CELL}
          height={HEATMAP_CELL}
          rx={2}
          fill={level > 0 ? "var(--primary)" : "var(--border)"}
          fillOpacity={level > 0 ? HEATMAP_OPACITIES[level - 1] : 0.4}
        >
          <title>
            {`${t("today.heatmapWords", { count: words })} · ${date.toLocaleDateString(lang, { month: "short", day: "numeric" })}`}
          </title>
        </rect>,
      );
    }
  }

  // Mon / Wed / Fri row labels, from real dates so they localize.
  const weekdayLabels = [1, 3, 5].map((d) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + d);
    return {
      y: topPad + d * HEATMAP_PITCH + HEATMAP_CELL - 3,
      label: date.toLocaleDateString(lang, { weekday: "narrow" }),
    };
  });

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={t("today.dailyActivity")}
        className="block h-auto"
      >
        {monthLabels.map((m) => (
          <text
            key={m.x}
            x={m.x}
            y={9}
            fontSize={8}
            fill="var(--muted-foreground)"
          >
            {m.label}
          </text>
        ))}
        {weekdayLabels.map((wd) => (
          <text
            key={wd.y}
            x={0}
            y={wd.y}
            fontSize={8}
            fill="var(--muted-foreground)"
          >
            {wd.label}
          </text>
        ))}
        {cells}
      </svg>
      <div className="text-muted-foreground flex items-center justify-end gap-1 text-[9px]">
        <span className="mr-0.5">{t("today.heatmapLess")}</span>
        <span
          className="size-[9px] rounded-[2px]"
          style={{ background: "var(--border)", opacity: 0.4 }}
        />
        {HEATMAP_OPACITIES.map((o) => (
          <span
            key={o}
            className="size-[9px] rounded-[2px]"
            style={{ background: "var(--primary)", opacity: o }}
          />
        ))}
        <span className="ml-0.5">{t("today.heatmapMore")}</span>
      </div>
    </div>
  );
}

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
        <div className="text-muted-foreground text-[10px]">{label}</div>
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
        <span className="text-foreground shrink-0 text-[11px] font-medium">
          {formatClock(entry.created_at)}
        </span>
        <span className="bg-muted-foreground/50 h-[3px] w-[3px] shrink-0 rounded-full" />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-primary min-w-0 max-w-fit cursor-default truncate text-[10.5px] font-semibold">
              {modelLabel}
            </span>
          </TooltipTrigger>
          <TooltipContent>{modelLabel}</TooltipContent>
        </Tooltip>
        <div className="flex-1" />
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
        <span className="text-muted-foreground shrink-0 text-[10px]">
          {formatSeconds(entry.audio_duration_ms || entry.duration_ms)}
        </span>
        {entry.cost_usd > 0 && (
          <span className="text-muted-foreground shrink-0 text-[10px]">
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
        <div className="text-muted-foreground/80 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
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
