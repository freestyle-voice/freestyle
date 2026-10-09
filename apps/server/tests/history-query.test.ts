import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/lib/db.js";
import { localDayBounds } from "../src/lib/local-day-bounds.js";
import history from "../src/routes/history.js";

// Node's local calendar uses IANA timezone rules on every native CI platform.
function setTimezone(zone: string): void {
  vi.stubEnv("TZ", zone);
}

function insert(createdAt: string, text = createdAt): void {
  getDb()
    .prepare(
      `INSERT INTO transcription_history
        (raw_text, voice_provider, voice_model, created_at, duration_ms, cost_usd)
       VALUES (?, 'test', 'test-model', ?, 1000, 0.5)`,
    )
    .run(text, createdAt);
}

async function list(query: string) {
  const response = await history.request(`/?${query}`);
  expect(response.status).toBe(200);
  return (await response.json()) as {
    items: { raw_text: string; created_at: string }[];
    total: number;
  };
}

async function stats(query: string) {
  const response = await history.request(`/stats?${query}`);
  expect(response.status).toBe(200);
  return (await response.json()) as {
    total_sessions: number;
    total_duration_ms: number;
    today_sessions: number;
    today_cost: number;
    unfiltered_total_sessions: number;
  };
}

beforeEach(() => {
  getDb().exec("DELETE FROM transcription_history");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("history calendar bounds using real SQLite", () => {
  it.each([
    [
      "2026-03-08",
      "America/New_York",
      "2026-03-08 05:00:00",
      "2026-03-09 04:00:00",
      23,
    ],
    [
      "2026-11-01",
      "America/New_York",
      "2026-11-01 04:00:00",
      "2026-11-02 05:00:00",
      25,
    ],
    [
      "2019-09-08",
      "America/Santiago",
      "2019-09-08 04:00:00",
      "2019-09-09 03:00:00",
      23,
    ],
  ] as const)("includes the whole %s DST day in %s", async (day, zone, start, end, hours) => {
    setTimezone(zone);
    const bounds = localDayBounds(day);
    expect(bounds).toEqual({ start, end });
    const beforeStart = new Date(new Date(`${start}Z`).getTime() - 1000);
    const beforeEnd = new Date(new Date(`${end}Z`).getTime() - 1);
    insert(beforeStart.toISOString().replace("T", " ").slice(0, 19));
    insert(start);
    insert(beforeEnd.toISOString().replace("T", " ").slice(0, -1));
    insert(end);

    const query = `start_date=${day}&end_date=${day}`;
    const result = await list(query);
    expect(result.total).toBe(2);
    expect(result.items.map((row) => row.created_at)).toEqual([
      beforeEnd.toISOString().replace("T", " ").slice(0, -1),
      start,
    ]);
    expect(await stats(query)).toMatchObject({
      total_sessions: 2,
      total_duration_ms: 2000,
      unfiltered_total_sessions: 4,
    });
    expect(
      new Date(`${bounds.end}Z`).getTime() -
        new Date(`${bounds.start}Z`).getTime(),
    ).toBe(hours * 60 * 60 * 1000);
  });

  it("returns an empty range for a skipped local calendar day", async () => {
    setTimezone("Pacific/Apia");
    expect(localDayBounds("2011-12-30")).toEqual({
      start: "2011-12-30 10:00:00",
      end: "2011-12-30 10:00:00",
    });
    insert("2011-12-30 09:59:59");
    insert("2011-12-30 10:00:00");
    const query = "start_date=2011-12-30&end_date=2011-12-30";
    expect((await list(query)).total).toBe(0);
    expect((await stats(query)).total_sessions).toBe(0);
  });

  it("preserves four-digit years below 100 and bounds at the calendar limit", async () => {
    setTimezone("UTC");
    expect(localDayBounds("0096-02-29")).toEqual({
      start: "0096-02-29 00:00:00",
      end: "0096-03-01 00:00:00",
    });
    insert("9999-12-31 23:59:59");
    expect((await list("end_date=9999-12-31")).total).toBe(1);
    expect((await stats("end_date=9999-12-31")).total_sessions).toBe(1);
  });

  it("uses the server local calendar in a timezone east of UTC", async () => {
    setTimezone("Asia/Tokyo");
    insert("2028-02-28 14:59:59");
    insert("2028-02-28 15:00:00");
    insert("2028-02-29 14:59:59");
    insert("2028-02-29 15:00:00");
    const query = "start_date=2028-02-29&end_date=2028-02-29";
    expect((await list(query)).total).toBe(2);
    expect((await stats(query)).total_sessions).toBe(2);
  });

  it("keeps one-sided ranges, pagination and literal search consistent with count", async () => {
    setTimezone("UTC");
    insert("2026-10-07 23:59:59", "match%");
    insert("2026-10-08 00:00:00", "match%");
    insert("2026-10-08 23:59:59", "match%");
    insert("2026-10-09 00:00:00", "match_other");
    const result = await list(
      "start_date=2026-10-08&search=match%25&limit=1&offset=1",
    );
    expect(result.total).toBe(2);
    expect(result.items.map((row) => row.created_at)).toEqual([
      "2026-10-08 00:00:00",
    ]);
    expect((await list("end_date=2026-10-08")).total).toBe(3);
    expect(
      (await stats("start_date=2026-10-08&search=match%25")).total_sessions,
    ).toBe(3);
    expect(
      (await list("start_date=2026-10-09&end_date=2026-10-08")).total,
    ).toBe(0);
  });

  it.each([
    "2026-02-30",
    "2027-02-29",
    "2026-13-01",
    "2026-00-08",
    "2026-10-00",
    "bad-date",
    "",
  ])("ignores invalid calendar input %s with the existing lenient contract", async (date) => {
    insert("2026-01-01 00:00:00");
    const query = `start_date=${date}&end_date=${date}`;
    expect((await list(query)).total).toBe(1);
    expect((await stats(query)).total_sessions).toBe(1);
  });

  it.each([
    ["2026-03-08T12:00:00Z", "2026-03-08 05:00:00", "2026-03-09 04:00:00"],
    ["2026-11-01T12:00:00Z", "2026-11-01 04:00:00", "2026-11-02 05:00:00"],
  ])("keeps today's totals independent of the selected range on %s", async (now, start, end) => {
    setTimezone("America/New_York");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    const beforeStart = new Date(new Date(`${start}Z`).getTime() - 1000);
    const beforeEnd = new Date(new Date(`${end}Z`).getTime() - 1);
    insert(beforeStart.toISOString().replace("T", " ").slice(0, 19));
    insert(start);
    insert(beforeEnd.toISOString().replace("T", " ").slice(0, -1));
    insert(end);
    insert("2020-01-01 06:00:00");
    expect(
      await stats("start_date=2020-01-01&end_date=2020-01-01"),
    ).toMatchObject({
      total_sessions: 1,
      today_sessions: 2,
      today_cost: 1,
      unfiltered_total_sessions: 5,
    });
  });

  it("range-scans the existing index for list, count, stats and today", async () => {
    const db = getDb();
    const prepare = vi.spyOn(db, "prepare");
    await list("start_date=2026-10-08&end_date=2026-10-09");
    await stats("start_date=2026-10-08&end_date=2026-10-09");
    const rangeQueries = prepare.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.includes("WHERE created_at >="));
    expect(rangeQueries).toHaveLength(4);
    prepare.mockRestore();
    for (const sql of rangeQueries) {
      const params = sql.includes("LIMIT ?")
        ? ["2026-10-08 00:00:00", "2026-10-10 00:00:00", 20, 0]
        : ["2026-10-08 00:00:00", "2026-10-10 00:00:00"];
      const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as {
        detail: string;
      }[];
      expect(
        plan.some(({ detail }) =>
          /SEARCH transcription_history USING (COVERING )?INDEX idx_transcription_history_created_at/.test(
            detail,
          ),
        ),
      ).toBe(true);
    }
  });
});
