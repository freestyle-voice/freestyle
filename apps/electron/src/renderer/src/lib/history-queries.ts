import { keepPreviousData } from "@tanstack/react-query";
import { getClient } from "./api";
import { queryKeys } from "./query";

export const HISTORY_PAGE_SIZE = 20;

export interface HistoryEntry {
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

export interface Stats {
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
export interface DayActivity {
  day: string;
  words: number;
  sessions: number;
}

export function historyListQueryOptions(
  page: number,
  search: string,
  startDate: string,
  endDate: string,
) {
  return {
    queryKey: queryKeys.history.list(page, search, startDate, endDate),
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const query: Record<string, string> = {
        limit: String(HISTORY_PAGE_SIZE),
        offset: String(page * HISTORY_PAGE_SIZE),
        orderBy: "-created_at",
      };
      if (search) query.search = search;
      if (startDate) query.start_date = startDate;
      if (endDate) query.end_date = endDate;
      const res = await getClient().api.history.$get(
        { query },
        { init: { signal } },
      );
      return res.ok
        ? ((await res.json()) as { items: HistoryEntry[]; total: number })
        : { items: [] as HistoryEntry[], total: 0 };
    },
    placeholderData: keepPreviousData,
  };
}

export function historyStatsQueryOptions(startDate: string, endDate: string) {
  return {
    queryKey: queryKeys.history.stats(startDate, endDate),
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const query: Record<string, string> = {};
      if (startDate) query.start_date = startDate;
      if (endDate) query.end_date = endDate;
      const res = await getClient().api.history.stats.$get(
        { query },
        { init: { signal } },
      );
      return res.ok ? ((await res.json()) as Stats) : null;
    },
    placeholderData: keepPreviousData,
  };
}

export function historyDailyQueryOptions() {
  return {
    queryKey: queryKeys.history.daily,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await getClient().api.history.daily.$get(
        {},
        { init: { signal } },
      );
      if (!res.ok) return [] as DayActivity[];
      const data = (await res.json()) as { days: DayActivity[] };
      return data.days;
    },
  };
}
