import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.js";
import { getDb } from "../src/lib/db.js";

// ---------------------------------------------------------------------------
// Helper – shorthand for making requests against the Hono app
// ---------------------------------------------------------------------------

function req(path: string, init?: RequestInit) {
  return app.request(path, init);
}

function json(path: string, body: unknown, method = "POST") {
  return req(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Root & Health
// ---------------------------------------------------------------------------

describe("Root & Health", () => {
  it("GET / returns Freestyle API text", async () => {
    const res = await req("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Freestyle API");
  });

  it("GET /api/health returns ok", async () => {
    const res = await req("/api/health");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ status: "ok", name: "freestyle" });
  });

  it("POST /api/client-error requires a message", async () => {
    const res = await json("/api/client-error", { stack: "x" });
    expect(res.status).toBe(400);
  });

  it("POST /api/client-error accepts a renderer error report", async () => {
    const res = await json("/api/client-error", {
      message: "boom",
      stack: "Error: boom\n  at foo",
      source: "renderer",
      context: { kind: "window.onerror" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// Settings CRUD
// ---------------------------------------------------------------------------

describe("Settings", () => {
  it("GET /api/settings returns empty object initially", async () => {
    const res = await req("/api/settings");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({});
  });

  it("PUT then GET a setting", async () => {
    const put = await json("/api/settings/theme", { value: "dark" }, "PUT");
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ key: "theme", value: "dark" });

    const get = await req("/api/settings/theme");
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ key: "theme", value: "dark" });
  });

  it("PUT overwrites an existing setting", async () => {
    await json("/api/settings/theme", { value: "dark" }, "PUT");
    await json("/api/settings/theme", { value: "light" }, "PUT");

    const get = await req("/api/settings/theme");
    const data = await get.json();
    expect(data.value).toBe("light");
  });

  it("GET returns 404 for unknown key", async () => {
    const res = await req("/api/settings/nonexistent");
    expect(res.status).toBe(404);
  });

  it("DELETE removes a setting", async () => {
    await json("/api/settings/to-delete", { value: "bye" }, "PUT");
    const del = await req("/api/settings/to-delete", { method: "DELETE" });
    expect(del.status).toBe(200);

    const get = await req("/api/settings/to-delete");
    expect(get.status).toBe(404);
  });

  it("GET /api/settings lists all settings", async () => {
    await json("/api/settings/a", { value: "1" }, "PUT");
    await json("/api/settings/b", { value: "2" }, "PUT");

    const res = await req("/api/settings");
    const data = await res.json();
    expect(data.a).toBe("1");
    expect(data.b).toBe("2");
  });

  it("PUT rejects missing value", async () => {
    const res = await json("/api/settings/bad", {}, "PUT");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("PUT accepts a valid plugins setting", async () => {
    const value = JSON.stringify(["freestyle-plugin-example"]);

    const res = await json("/api/settings/plugins", { value }, "PUT");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ key: "plugins", value });
  });

  it("PUT rejects malformed plugins settings", async () => {
    const invalidJson = await json(
      "/api/settings/plugins",
      { value: "not json" },
      "PUT",
    );
    expect(invalidJson.status).toBe(400);

    const invalidShape = await json(
      "/api/settings/plugins",
      { value: JSON.stringify([["plugin", "not-options"]]) },
      "PUT",
    );
    expect(invalidShape.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Dictionary CRUD
// ---------------------------------------------------------------------------

describe("Dictionary", () => {
  it("GET /api/dictionary returns empty list initially (ignoring seed data)", async () => {
    const res = await req("/api/dictionary");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("total");
    expect(Array.isArray(data.items)).toBe(true);
  });

  it("POST creates a new entry", async () => {
    const res = await json("/api/dictionary", {
      key: "type script",
      value: "TypeScript",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.key).toBe("type script");
    expect(data.value).toBe("TypeScript");
    expect(data.id).toBeDefined();
  });

  it("GET /:id returns the created entry", async () => {
    const create = await json("/api/dictionary", {
      key: "react js",
      value: "React.js",
    });
    const { id } = await create.json();

    const get = await req(`/api/dictionary/${id}`);
    expect(get.status).toBe(200);
    const data = await get.json();
    expect(data.key).toBe("react js");
    expect(data.value).toBe("React.js");
  });

  it("PUT updates an entry", async () => {
    const create = await json("/api/dictionary", {
      key: "node js",
      value: "Node.js",
    });
    const { id } = await create.json();

    const put = await json(`/api/dictionary/${id}`, { value: "NodeJS" }, "PUT");
    expect(put.status).toBe(200);
    const data = await put.json();
    expect(data.value).toBe("NodeJS");
  });

  it("DELETE removes an entry", async () => {
    const create = await json("/api/dictionary", {
      key: "to delete",
      value: "gone",
    });
    const { id } = await create.json();

    const del = await req(`/api/dictionary/${id}`, { method: "DELETE" });
    expect(del.status).toBe(200);

    const get = await req(`/api/dictionary/${id}`);
    expect(get.status).toBe(404);
  });

  it("POST rejects duplicate keys", async () => {
    await json("/api/dictionary", { key: "dupe", value: "first" });
    const res = await json("/api/dictionary", { key: "dupe", value: "second" });
    expect(res.status).toBe(409);
  });

  it("GET /api/dictionary supports search", async () => {
    await json("/api/dictionary", { key: "searchable", value: "findme" });

    const res = await req("/api/dictionary?search=searchable");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    expect(
      data.items.some((i: { key: string }) => i.key === "searchable"),
    ).toBe(true);
  });

  it("GET /api/dictionary/all returns all entries", async () => {
    const res = await req("/api/dictionary/all");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("POST /api/dictionary/import bulk imports", async () => {
    const entries = [
      { key: "import one", value: "Import1" },
      { key: "import two", value: "Import2" },
    ];
    const res = await json("/api/dictionary/import", entries);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.imported).toBe(2);
    expect(data.skipped).toBe(0);
  });

  it("POST /api/dictionary/export returns JSON export", async () => {
    const res = await json("/api/dictionary/export", { type: "json" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Vocabulary CRUD
// ---------------------------------------------------------------------------

describe("Vocabulary", () => {
  it("GET /api/vocabulary returns list shape", async () => {
    const res = await req("/api/vocabulary");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("total");
    expect(Array.isArray(data.items)).toBe(true);
  });

  it("POST creates a new term", async () => {
    const res = await json("/api/vocabulary", {
      term: "TypeScript",
      notes: "Programming language",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.term).toBe("TypeScript");
    expect(data.notes).toBe("Programming language");
    expect(data.id).toBeDefined();
  });

  it("GET /:id returns the created term", async () => {
    const create = await json("/api/vocabulary", { term: "Kubernetes" });
    const { id } = await create.json();

    const get = await req(`/api/vocabulary/${id}`);
    expect(get.status).toBe(200);
    expect((await get.json()).term).toBe("Kubernetes");
  });

  it("PUT updates a term", async () => {
    const create = await json("/api/vocabulary", { term: "React" });
    const { id } = await create.json();

    const put = await json(
      `/api/vocabulary/${id}`,
      { notes: "UI library" },
      "PUT",
    );
    expect(put.status).toBe(200);
    expect((await put.json()).notes).toBe("UI library");
  });

  it("DELETE removes a term", async () => {
    const create = await json("/api/vocabulary", { term: "to-delete" });
    const { id } = await create.json();

    const del = await req(`/api/vocabulary/${id}`, { method: "DELETE" });
    expect(del.status).toBe(200);

    const get = await req(`/api/vocabulary/${id}`);
    expect(get.status).toBe(404);
  });

  it("POST rejects duplicate terms", async () => {
    await json("/api/vocabulary", { term: "dupe-term" });
    const res = await json("/api/vocabulary", { term: "dupe-term" });
    expect(res.status).toBe(409);
  });

  it("GET /api/vocabulary supports search", async () => {
    await json("/api/vocabulary", { term: "searchable-vocab" });

    const res = await req("/api/vocabulary?search=searchable-vocab");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(
      data.items.some((i: { term: string }) => i.term === "searchable-vocab"),
    ).toBe(true);
  });

  it("GET /api/vocabulary/all returns all terms", async () => {
    const res = await req("/api/vocabulary/all");
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("POST /api/vocabulary/import bulk imports", async () => {
    const res = await json("/api/vocabulary/import", [
      { term: "import-one" },
      { term: "import-two", notes: "note" },
    ]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.imported).toBe(2);
    expect(data.skipped).toBe(0);
  });

  it("POST /api/vocabulary/export returns JSON export", async () => {
    const res = await json("/api/vocabulary/export", { type: "json" });
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Format Rules CRUD
// ---------------------------------------------------------------------------

describe("Formats", () => {
  it("GET /api/formats returns seeded defaults", async () => {
    const res = await req("/api/formats");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBeGreaterThan(0);
    // The schema seeds 10 default format rules
    expect(data.items.length).toBeGreaterThanOrEqual(10);
  });

  it("POST creates a custom format", async () => {
    const res = await json("/api/formats", {
      app_pattern: "figma.com|Figma",
      label: "Figma",
      instructions: "Design-focused, concise annotations.",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.label).toBe("Figma");
  });

  it("GET /:id returns a format", async () => {
    const create = await json("/api/formats", {
      app_pattern: "test-app",
      label: "Test",
      instructions: "Test instructions.",
    });
    const { id } = await create.json();

    const get = await req(`/api/formats/${id}`);
    expect(get.status).toBe(200);
    const data = await get.json();
    expect(data.label).toBe("Test");
  });

  it("PUT updates a format", async () => {
    const create = await json("/api/formats", {
      app_pattern: "update-me",
      label: "Before",
      instructions: "Old instructions.",
    });
    const { id } = await create.json();

    const put = await json(
      `/api/formats/${id}`,
      { label: "After", instructions: "New instructions." },
      "PUT",
    );
    expect(put.status).toBe(200);

    const get = await req(`/api/formats/${id}`);
    const data = await get.json();
    expect(data.label).toBe("After");
    expect(data.instructions).toBe("New instructions.");
  });

  it("DELETE removes a format", async () => {
    const create = await json("/api/formats", {
      app_pattern: "delete-me",
      label: "ToDelete",
      instructions: "Will be deleted.",
    });
    const { id } = await create.json();

    const del = await req(`/api/formats/${id}`, { method: "DELETE" });
    expect(del.status).toBe(200);

    const get = await req(`/api/formats/${id}`);
    expect(get.status).toBe(404);
  });

  it("GET /api/formats/match matches by context", async () => {
    // The seed data includes a Slack rule with pattern "slack.com|Slack"
    const res = await req("/api/formats/match?context=slack.com");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).not.toBeNull();
    expect(data.label).toBe("Slack");
  });

  it("GET /api/formats/match returns null for unknown context", async () => {
    const res = await req("/api/formats/match?context=unknownapp");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeNull();
  });

  it("GET /api/formats supports search", async () => {
    const res = await req("/api/formats?search=Email");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items.some((i: { label: string }) => i.label === "Email")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// API Keys CRUD
// ---------------------------------------------------------------------------

describe("API Keys", () => {
  it("GET /api/keys returns empty list initially", async () => {
    const res = await req("/api/keys");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("POST stores an API key", async () => {
    const res = await json("/api/keys", {
      provider: "openai",
      key: "sk-test-123",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.provider).toBe("openai");
    expect(data.configured).toBe(true);
  });

  it("GET /:provider confirms key is configured (key not exposed)", async () => {
    await json("/api/keys", { provider: "groq", key: "gsk-test" });

    const get = await req("/api/keys/groq");
    expect(get.status).toBe(200);
    const data = await get.json();
    expect(data.provider).toBe("groq");
    expect(data.configured).toBe(true);
    // The actual key must NOT be returned
    expect(data.key).toBeUndefined();
  });

  it("GET /:provider returns 404 for missing provider", async () => {
    const res = await req("/api/keys/nonexistent");
    expect(res.status).toBe(404);
  });

  it("DELETE removes an API key", async () => {
    await json("/api/keys", { provider: "anthropic", key: "sk-ant-test" });

    const del = await req("/api/keys/anthropic", { method: "DELETE" });
    expect(del.status).toBe(200);

    const get = await req("/api/keys/anthropic");
    expect(get.status).toBe(404);
  });

  it("POST upserts on conflict", async () => {
    await json("/api/keys", { provider: "deepgram", key: "old-key" });
    await json("/api/keys", { provider: "deepgram", key: "new-key" });

    const list = await req("/api/keys");
    const data = await list.json();
    const deepgram = data.filter(
      (k: { provider: string }) => k.provider === "deepgram",
    );
    expect(deepgram.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

describe("History", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM transcription_history");
  });

  it("GET /api/history returns empty list initially", async () => {
    const res = await req("/api/history");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("GET /api/history/stats returns zero stats initially", async () => {
    const res = await req("/api/history/stats");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total_sessions).toBe(0);
    expect(data.total_cost_usd).toBe(0);
  });

  it("GET /api/history/:id returns 404 for missing entry", async () => {
    const res = await req("/api/history/9999");
    expect(res.status).toBe(404);
  });

  it("GET /api/history and /stats with date filters", async () => {
    const db = getDb();

    // Insert mock history records
    const insertStmt = db.prepare(`
      INSERT INTO transcription_history (
        raw_text, cleaned_text, voice_provider, voice_model, llm_provider, llm_model, 
        duration_ms, audio_duration_ms, input_tokens, output_tokens, cost_usd, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date();

    const formatDate = (d: Date, daysAgo = 0) => {
      const target = new Date(d);
      target.setUTCDate(target.getUTCDate() - daysAgo);
      const year = target.getUTCFullYear();
      const month = String(target.getUTCMonth() + 1).padStart(2, "0");
      const day = String(target.getUTCDate()).padStart(2, "0");
      return `${year}-${month}-${day} 12:00:00`;
    };

    const date10DaysAgo = formatDate(now, 10);
    const date2DaysAgo = formatDate(now, 2);
    const dateToday = formatDate(now, 0);

    // Insert 10 days ago (cost 1.50)
    insertStmt.run(
      "Text 10 days ago",
      "Clean 1",
      "voice",
      "model",
      "llm",
      "model",
      1000,
      1000,
      10,
      10,
      1.5,
      date10DaysAgo,
    );
    // Insert 2 days ago (cost 0.50)
    insertStmt.run(
      "Text 2 days ago",
      "Clean 2",
      "voice",
      "model",
      "llm",
      "model",
      1000,
      1000,
      10,
      10,
      0.5,
      date2DaysAgo,
    );
    // Insert today (cost 2.00)
    insertStmt.run(
      "Text today",
      "Clean 3",
      "voice",
      "model",
      "llm",
      "model",
      1000,
      1000,
      10,
      10,
      2.0,
      dateToday,
    );

    const todayStr = dateToday.split(" ")[0];
    const start7DaysAgoStr = formatDate(now, 7).split(" ")[0];

    // 1. Test unfiltered stats returns unfiltered_total_sessions = 3
    const statsResAll = await req("/api/history/stats");
    const statsAll = await statsResAll.json();
    expect(statsAll.unfiltered_total_sessions).toBe(3);
    expect(statsAll.total_sessions).toBe(3);
    expect(statsAll.total_cost_usd).toBe(4.0);

    // 2. Test GET /api/history filtering to past 7 days (weekly default)
    const historyWeeklyRes = await req(
      `/api/history?start_date=${start7DaysAgoStr}&end_date=${todayStr}`,
    );
    const historyWeekly = await historyWeeklyRes.json();
    expect(historyWeekly.total).toBe(2);
    expect(historyWeekly.items.map((i: any) => i.raw_text)).toContain(
      "Text 2 days ago",
    );
    expect(historyWeekly.items.map((i: any) => i.raw_text)).toContain(
      "Text today",
    );

    // 3. Test GET /api/history/stats filtering to past 7 days
    const statsWeeklyRes = await req(
      `/api/history/stats?start_date=${start7DaysAgoStr}&end_date=${todayStr}`,
    );
    const statsWeekly = await statsWeeklyRes.json();
    expect(statsWeekly.unfiltered_total_sessions).toBe(3);
    expect(statsWeekly.total_sessions).toBe(2);
    expect(statsWeekly.total_cost_usd).toBe(2.5);

    // 4. Test start_date validation fails (ignored if invalid format)
    const statsInvalidRes = await req(
      `/api/history/stats?start_date=invalid-date&end_date=${todayStr}`,
    );
    const statsInvalid = await statsInvalidRes.json();
    expect(statsInvalid.total_sessions).toBe(3);
  });
});
