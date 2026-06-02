import { describe, expect, it } from "vitest";
import app from "../src/index.js";

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

  it("GET /api/dictionary/export/json returns JSON export", async () => {
    const res = await req("/api/dictionary/export/json");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
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
});

// ---------------------------------------------------------------------------
// Shortcuts CRUD
// ---------------------------------------------------------------------------

describe("Shortcuts", () => {
  it("GET /api/shortcuts returns empty list initially", async () => {
    const res = await req("/api/shortcuts");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("total");
    expect(Array.isArray(data.items)).toBe(true);
  });

  it("POST creates a single-step replace shortcut", async () => {
    const res = await json("/api/shortcuts", {
      key: "my email",
      description: "Insert my email address",
      steps: [{ action: "replace", value: "test@example.com" }],
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.key).toBe("my email");
    expect(data.id).toBeDefined();
    expect(data.steps).toHaveLength(1);
    expect(data.steps[0].action).toBe("replace");
    expect(data.steps[0].value).toBe("test@example.com");
  });

  it("POST creates a multi-step shortcut", async () => {
    const res = await json("/api/shortcuts", {
      key: "send report",
      steps: [
        { action: "replace", value: "Here is the report" },
        { action: "open_url", value: "https://example.com/report" },
      ],
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.steps).toHaveLength(2);
    expect(data.steps[0].action).toBe("replace");
    expect(data.steps[1].action).toBe("open_url");
  });

  it("POST creates a shortcut with variables", async () => {
    const res = await json("/api/shortcuts", {
      key: "search {query}",
      description: "Search the web",
      steps: [
        { action: "open_url", value: "https://google.com/search?q={query}" },
      ],
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.key).toBe("search {query}");
  });

  it("GET /:id returns shortcut with steps", async () => {
    const create = await json("/api/shortcuts", {
      key: "get by id test",
      steps: [{ action: "replace", value: "found it" }],
    });
    const { id } = await create.json();

    const get = await req(`/api/shortcuts/${id}`);
    expect(get.status).toBe(200);
    const data = await get.json();
    expect(data.key).toBe("get by id test");
    expect(data.steps).toHaveLength(1);
    expect(data.steps[0].value).toBe("found it");
  });

  it("PUT updates steps", async () => {
    const create = await json("/api/shortcuts", {
      key: "update steps test",
      steps: [{ action: "replace", value: "original" }],
    });
    const { id } = await create.json();

    const put = await json(
      `/api/shortcuts/${id}`,
      {
        steps: [
          { action: "replace", value: "updated" },
          { action: "open_app", value: "Notes" },
        ],
      },
      "PUT",
    );
    expect(put.status).toBe(200);
    const data = await put.json();
    expect(data.steps).toHaveLength(2);
    expect(data.steps[0].value).toBe("updated");
    expect(data.steps[1].action).toBe("open_app");
  });

  it("DELETE removes a shortcut", async () => {
    const create = await json("/api/shortcuts", {
      key: "to delete shortcut",
      steps: [{ action: "replace", value: "gone" }],
    });
    const { id } = await create.json();

    const del = await req(`/api/shortcuts/${id}`, { method: "DELETE" });
    expect(del.status).toBe(200);

    const get = await req(`/api/shortcuts/${id}`);
    expect(get.status).toBe(404);
  });

  it("POST rejects duplicate keys", async () => {
    await json("/api/shortcuts", {
      key: "dupe shortcut",
      steps: [{ action: "replace", value: "first" }],
    });
    const res = await json("/api/shortcuts", {
      key: "dupe shortcut",
      steps: [{ action: "replace", value: "second" }],
    });
    expect(res.status).toBe(409);
  });

  it("GET /api/shortcuts supports search", async () => {
    await json("/api/shortcuts", {
      key: "searchable shortcut",
      steps: [{ action: "replace", value: "findme" }],
    });

    const res = await req("/api/shortcuts?search=searchable");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    expect(
      data.items.some((i: { key: string }) => i.key === "searchable shortcut"),
    ).toBe(true);
  });

  it("GET /api/shortcuts/all returns all with steps", async () => {
    const res = await req("/api/shortcuts/all");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("steps");
    }
  });

  it("POST /api/shortcuts/import imports legacy format", async () => {
    const entries = [
      { key: "legacy import one", value: "LegacyValue1", action: "replace" },
      { key: "legacy import two", value: "LegacyValue2" },
    ];
    const res = await json("/api/shortcuts/import", entries);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.imported).toBe(2);
    expect(data.skipped).toBe(0);
  });

  it("POST /api/shortcuts/import imports steps format", async () => {
    const entries = [
      {
        key: "steps import one",
        steps: [
          { action: "replace", value: "StepsValue1" },
          { action: "open_app", value: "Notes" },
        ],
      },
    ];
    const res = await json("/api/shortcuts/import", entries);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.imported).toBe(1);
  });

  it("GET /api/shortcuts/export/json returns JSON export with steps", async () => {
    const res = await req("/api/shortcuts/export/json");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("key");
      expect(data[0]).toHaveProperty("steps");
    }
  });
});
