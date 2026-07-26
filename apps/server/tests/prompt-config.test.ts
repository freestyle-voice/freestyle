import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetCleanupPromptConfigForTests,
  BUNDLED_CLEANUP_PROMPT_CONFIG,
  CLEANUP_PROMPT_CONFIG_SCHEMA,
  ensureCleanupPromptConfigFresh,
  getCleanupPromptConfig,
  refreshCleanupPromptConfig,
} from "../src/lib/editor/prompt-config.js";

function cloudPayload(overrides: Record<string, unknown> = {}) {
  return {
    ...structuredClone(BUNDLED_CLEANUP_PROMPT_CONFIG),
    // Marker so we can tell the cloud copy apart from the bundled one.
    presets: {
      ...BUNDLED_CLEANUP_PROMPT_CONFIG.presets,
      low: "CLOUD LOW PRESET",
    },
    ...overrides,
  };
}

describe("cleanup prompt config fetcher", () => {
  beforeEach(() => {
    __resetCleanupPromptConfigForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetCleanupPromptConfigForTests();
  });

  it("returns the bundled config before any fetch", () => {
    expect(getCleanupPromptConfig()).toBe(BUNDLED_CLEANUP_PROMPT_CONFIG);
  });

  it("adopts a valid cloud payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(cloudPayload()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await refreshCleanupPromptConfig();

    expect(getCleanupPromptConfig().presets.low).toBe("CLOUD LOW PRESET");
  });

  it("keeps the bundled config when the fetch fails (offline)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await refreshCleanupPromptConfig();

    expect(getCleanupPromptConfig()).toBe(BUNDLED_CLEANUP_PROMPT_CONFIG);
  });

  it("keeps the previous cloud config when a later refresh fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(cloudPayload()), { status: 200 }),
      )
      .mockRejectedValueOnce(new Error("offline"));

    await refreshCleanupPromptConfig();
    expect(getCleanupPromptConfig().presets.low).toBe("CLOUD LOW PRESET");

    // A subsequent failed refresh must NOT clear the last-good copy.
    await refreshCleanupPromptConfig();
    expect(getCleanupPromptConfig().presets.low).toBe("CLOUD LOW PRESET");
  });

  it("ignores a payload with an unknown schema", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          cloudPayload({ schema: CLEANUP_PROMPT_CONFIG_SCHEMA + 99 }),
        ),
        { status: 200 },
      ),
    );

    await refreshCleanupPromptConfig();

    expect(getCleanupPromptConfig()).toBe(BUNDLED_CLEANUP_PROMPT_CONFIG);
  });

  it("ignores a structurally invalid payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schema: CLEANUP_PROMPT_CONFIG_SCHEMA }), {
        status: 200,
      }),
    );

    await refreshCleanupPromptConfig();

    expect(getCleanupPromptConfig()).toBe(BUNDLED_CLEANUP_PROMPT_CONFIG);
  });

  it("ignores a payload whose preset/tone bodies are not strings", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          cloudPayload({
            presets: { low: 42, medium: "m", high: "h" },
          }),
        ),
        { status: 200 },
      ),
    );

    await refreshCleanupPromptConfig();

    expect(getCleanupPromptConfig()).toBe(BUNDLED_CLEANUP_PROMPT_CONFIG);
  });

  it("ignores a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );

    await refreshCleanupPromptConfig();

    expect(getCleanupPromptConfig()).toBe(BUNDLED_CLEANUP_PROMPT_CONFIG);
  });

  it("dedupes concurrent refreshes into a single fetch", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const gate = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValue(gate as unknown as Promise<Response>);

    const all = Promise.all([
      refreshCleanupPromptConfig(),
      refreshCleanupPromptConfig(),
      refreshCleanupPromptConfig(),
    ]);

    // Release the single in-flight fetch shared by all three callers.
    resolveFetch(new Response(JSON.stringify(cloudPayload()), { status: 200 }));
    await all;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ensureCleanupPromptConfigFresh does not refetch while fresh", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(cloudPayload()), { status: 200 }),
      );

    await ensureCleanupPromptConfigFresh();
    await ensureCleanupPromptConfigFresh();

    // Second call is a no-op because the config is still fresh.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes the app version in the query string", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(cloudPayload()), { status: 200 }),
      );
    const prev = process.env.FREESTYLE_APP_VERSION;
    process.env.FREESTYLE_APP_VERSION = "9.9.9";

    await refreshCleanupPromptConfig();

    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/v2/prompts/cleanup?v=9.9.9");

    if (prev === undefined) delete process.env.FREESTYLE_APP_VERSION;
    else process.env.FREESTYLE_APP_VERSION = prev;
  });
});
