import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postProcessWithFreestyleCloud } from "../src/lib/freestyle-cloud.js";

/**
 * Regression guard for the Mode 2 (local voice + Freestyle Cloud cleanup) path.
 *
 * The cloud reads the user's synced cleanup preferences (intensity, custom
 * prompt, tones, app assignments, languages) from the member_preferences row
 * and assembles the prompt server-side, so the desktop no longer forwards those
 * saved defaults. The `/v2/post-process` body must carry only the text to clean
 * plus request-scoped context (`appContext`, plugin `systemFragments`).
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

  it("sends only text + appContext by default (no synced preference fields)", async () => {
    await postProcessWithFreestyleCloud({
      token: "t",
      text: "hello world",
      appContext: null,
    });

    const body = sentBody();
    expect(body.text).toBe("hello world");
    expect(body.appContext).toBeNull();
    // The synced cleanup preferences are read from member_preferences on the
    // cloud, so they must never appear in the request body.
    for (const field of [
      "intensity",
      "customPrompt",
      "personalTone",
      "workTone",
      "emailTone",
      "overallTone",
      "appAssignments",
      "languages",
    ]) {
      expect(body).not.toHaveProperty(field);
    }
    expect(body).not.toHaveProperty("systemFragments");
  });

  it("forwards plugin systemFragments when present", async () => {
    await postProcessWithFreestyleCloud({
      token: "t",
      text: "hello world",
      appContext: "Slack",
      systemFragments: ["Add emoji."],
    });

    const body = sentBody();
    expect(body.systemFragments).toEqual(["Add emoji."]);
    expect(body.appContext).toBe("Slack");
  });

  it("omits systemFragments when empty", async () => {
    await postProcessWithFreestyleCloud({
      token: "t",
      text: "hello world",
      systemFragments: [],
    });

    expect(sentBody()).not.toHaveProperty("systemFragments");
  });
});
