import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  historyDailyQueryOptions,
  historyListQueryOptions,
  historyStatsQueryOptions,
} from "./history-queries";
import { queryKeys } from "./query";

const { getList, getStats, getDaily } = vi.hoisted(() => ({
  getList: vi.fn(),
  getStats: vi.fn(),
  getDaily: vi.fn(),
}));
vi.mock("./api", () => ({
  getClient: () => ({
    api: {
      history: {
        $get: getList,
        stats: { $get: getStats },
        daily: { $get: getDaily },
      },
    },
  }),
}));

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  getList
    .mockReset()
    .mockImplementation(async () =>
      Response.json({ items: [{ id: 1 }], total: 40 }),
    );
  getStats
    .mockReset()
    .mockImplementation(async () => Response.json({ total_sessions: 40 }));
  getDaily
    .mockReset()
    .mockImplementation(async () => Response.json({ days: [] }));
});
afterEach(() => client.clear());

describe("history query efficiency", () => {
  it("reuses date-only stats across search and page changes, then reloads for new dates", async () => {
    for (const [page, search] of [
      [0, ""],
      [1, ""],
      [0, "hello"],
    ] as const) {
      await client.fetchQuery(
        historyListQueryOptions(page, search, "2026-10-08", "2026-10-09"),
      );
      await client.fetchQuery(
        historyStatsQueryOptions("2026-10-08", "2026-10-09"),
      );
    }
    expect(getList).toHaveBeenCalledTimes(3);
    expect(getStats).toHaveBeenCalledTimes(1);
    expect(getList.mock.calls[1][0].query.offset).toBe("20");
    expect(getList.mock.calls[2][0].query.search).toBe("hello");
    expect(getStats.mock.calls[0][0].query).toEqual({
      start_date: "2026-10-08",
      end_date: "2026-10-09",
    });
    await client.fetchQuery(
      historyStatsQueryOptions("2026-10-09", "2026-10-09"),
    );
    expect(getStats).toHaveBeenCalledTimes(2);
  });

  it("lets the feed resolve while stats are still pending", async () => {
    let resolveStats!: (response: Response) => void;
    getStats.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveStats = resolve;
        }),
    );
    const pendingStats = client.fetchQuery(historyStatsQueryOptions("", ""));
    const list = await client.fetchQuery(
      historyListQueryOptions(0, "", "", ""),
    );
    expect(list.total).toBe(40);
    expect(client.getQueryState(queryKeys.history.stats("", ""))?.status).toBe(
      "pending",
    );
    resolveStats(Response.json({ total_sessions: 40 }));
    await pendingStats;
  });

  it("retains previous results while the next page loads, aborting when its observer leaves", async () => {
    const first = historyListQueryOptions(0, "", "", "");
    await client.fetchQuery(first);
    getList.mockImplementation(() => new Promise(() => {}));
    const observer = new QueryObserver(client, first);
    const unsubscribe = observer.subscribe(() => {});
    observer.setOptions(historyListQueryOptions(1, "", "", ""));
    expect(observer.getCurrentResult()).toMatchObject({
      isPlaceholderData: true,
      isLoading: false,
      data: { total: 40 },
    });
    const signal = getList.mock.calls[1][1].init.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    unsubscribe();
    expect(signal.aborted).toBe(true);
  });

  it.each([
    ["list", () => historyListQueryOptions(0, "", "", ""), () => getList],
    ["stats", () => historyStatsQueryOptions("", ""), () => getStats],
    ["daily", () => historyDailyQueryOptions(), () => getDaily],
  ] as const)("forwards query cancellation to %s requests", async (_name, options, request) => {
    request().mockImplementation(() => new Promise(() => {}));
    const query = options();
    const pending = client.fetchQuery<unknown>(query).catch(() => {});
    const signal = request().mock.calls[0][1].init.signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    await client.cancelQueries({ queryKey: query.queryKey });
    expect(signal.aborted).toBe(true);
    await pending;
  });

  it("invalidates all three caches after a completed transcription", async () => {
    const options = [
      historyListQueryOptions(0, "", "", ""),
      historyStatsQueryOptions("", ""),
      historyDailyQueryOptions(),
    ];
    await Promise.all(
      options.map((option) => client.fetchQuery<unknown>(option)),
    );
    await client.invalidateQueries({ queryKey: queryKeys.history.all });
    for (const option of options) {
      expect(client.getQueryState(option.queryKey)?.isInvalidated).toBe(true);
    }
  });
});

describe("history failures remain errors", () => {
  it("retains cached history when a refresh fails", async () => {
    const options = historyListQueryOptions(0, "", "", "");
    const cached = await client.fetchQuery(options);
    getList.mockResolvedValue(new Response("failed", { status: 500 }));
    await expect(
      client.fetchQuery({ ...options, staleTime: 0 }),
    ).rejects.toThrow("HTTP 500");
    expect(client.getQueryData(options.queryKey)).toEqual(cached);
    expect(client.getQueryState(options.queryKey)?.status).toBe("error");
  });
  it("isolates a failed stats request from a successful history list", async () => {
    getStats.mockResolvedValue(new Response("failed", { status: 503 }));
    await expect(
      client.fetchQuery(historyStatsQueryOptions("", "")),
    ).rejects.toThrow("HTTP 503");
    await expect(
      client.fetchQuery(historyListQueryOptions(0, "", "", "")),
    ).resolves.toMatchObject({ total: 40 });
  });
});
