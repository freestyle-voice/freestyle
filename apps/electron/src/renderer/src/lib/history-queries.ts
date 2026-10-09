import { keepPreviousData } from "@tanstack/react-query";
import { getClient } from "./api";
import { checkedJson } from "./checked-response";
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
      return checkedJson<{ items: HistoryEntry[]; total: number }>(
        getClient().api.history.$get({ query }, { init: { signal } }),
        "Could not load history",
      );
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
      return checkedJson<Stats>(
        getClient().api.history.stats.$get({ query }, { init: { signal } }),
        "Could not load history statistics",
      );
    },
    placeholderData: keepPreviousData,
  };
}

export function historyDailyQueryOptions() {
  return {
    queryKey: queryKeys.history.daily,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const data = await checkedJson<{ days: DayActivity[] }>(
        getClient().api.history.daily.$get({}, { init: { signal } }),
        "Could not load daily activity",
      );
      return data.days;
    },
  };
}
