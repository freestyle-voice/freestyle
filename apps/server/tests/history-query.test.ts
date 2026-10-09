import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/lib/db.js";
import history from "../src/routes/history.js";

// SQLite uses the platform C runtime for local time. Windows' CRT expects
// a three-letter TZ and UTC offset rather than an IANA zone identifier.
function setTimezone(zone: "America/New_York" | "Asia/Tokyo" | "UTC"): void {
  const windowsZones = {
    "America/New_York": "EST5EDT",
    "Asia/Tokyo": "JST-9",
    UTC: "UTC0",
  };
  vi.stubEnv("TZ", process.platform === "win32" ? windowsZones[zone] : zone);
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
});

describe("history calendar bounds using real SQLite", () => {
  it.each([
    ["2026-03-08", "2026-03-08 05:00:00", "2026-03-09 04:00:00", 23],
    ["2026-11-01", "2026-11-01 04:00:00", "2026-11-02 05:00:00", 25],
  ] as const)("includes the whole %s DST day", async (day, start, end, hours) => {
    setTimezone("America/New_York");
    const beforeStart = new Date(`${start}Z`);
    beforeStart.setSeconds(beforeStart.getSeconds() - 1);
    const beforeEnd = new Date(`${end}Z`);
    beforeEnd.setMilliseconds(beforeEnd.getMilliseconds() - 1);
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
      new Date(`${end}Z`).getTime() - new Date(`${start}Z`).getTime(),
    ).toBe(hours * 60 * 60 * 1000);
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

  it("keeps today's totals independent of the selected range", async () => {
    setTimezone("America/New_York");
    const db = getDb();
    const bounds = db
      .prepare(
        `SELECT datetime('now', 'localtime', 'start of day', 'utc') as start,
              datetime('now', 'localtime', 'start of day', '+1 day', 'utc') as end`,
      )
      .get() as { start: string; end: string };
    insert(bounds.start);
    insert(bounds.end);
    insert("2020-01-01 06:00:00");
    expect(
      await stats("start_date=2020-01-01&end_date=2020-01-01"),
    ).toMatchObject({
      total_sessions: 1,
      today_sessions: 1,
      today_cost: 0.5,
      unfiltered_total_sessions: 3,
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
        ? ["2026-10-08", "2026-10-09", 20, 0]
        : sql.includes("datetime(?,")
          ? ["2026-10-08", "2026-10-09"]
          : [];
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
