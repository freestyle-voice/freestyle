import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeWithFreestyleCloud } from "../src/lib/freestyle-cloud.js";

describe("transcribeWithFreestyleCloud payload", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ raw: "done" }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends an explicit empty language list to request Cloud auto-detect", async () => {
    await transcribeWithFreestyleCloud({
      token: "t",
      audio: new Uint8Array([1]),
      languages: [],
      mode: "raw",
    });

    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(body.get("languages")).toBe("[]");
  });
});
