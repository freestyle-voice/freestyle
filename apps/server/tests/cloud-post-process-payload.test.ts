import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postProcessWithFreestyleCloud } from "../src/lib/freestyle-cloud.js";

/**
 * Regression guard for the Mode 2 (local voice + Freestyle Cloud cleanup) path.
 *
 * The cloud `/v2/post-process` schema validates `customPrompt` as
 * `z.string().optional()`, which rejects an explicit `null` with a 400. When no
 * custom prompt is configured (the default low/medium/high intensities), the
 * body must omit `customPrompt` entirely rather than send `null`.
 */
describe("postProcessWithFreestyleCloud payload", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cleaned: "done" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function sentBody(): Record<string, unknown> {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return JSON.parse(init.body as string) as Record<string, unknown>;
  }

  it("omits customPrompt when none is set (never sends null)", async () => {
    await postProcessWithFreestyleCloud({
      token: "t",
      text: "hello world",
      intensity: "medium",
      customPrompt: undefined,
    });

    const body = sentBody();
    expect(body).not.toHaveProperty("customPrompt");
    expect(body.customPrompt).toBeUndefined();
  });

  it("omits customPrompt when passed null", async () => {
    await postProcessWithFreestyleCloud({
      token: "t",
      text: "hello world",
      intensity: "low",
      customPrompt: null,
    });

    expect(sentBody()).not.toHaveProperty("customPrompt");
  });

  it("forwards a real custom prompt when provided", async () => {
    await postProcessWithFreestyleCloud({
      token: "t",
      text: "hello world",
      intensity: "custom",
      customPrompt: "Rewrite as a formal email.",
    });

    expect(sentBody().customPrompt).toBe("Rewrite as a formal email.");
  });
});
