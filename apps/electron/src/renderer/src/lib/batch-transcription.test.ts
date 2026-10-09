import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeBatch } from "./batch-transcription";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({
  apiFetch: fetchMock,
  getApiBase: () => "http://localhost:4649",
  isRemoteServer: () => false,
}));
afterEach(() => vi.clearAllMocks());
const audio = new Blob(["audio"]);
describe("batch transcription transport", () => {
  it("encodes context and shares delivery mapping with fallback", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          raw: " raw ",
          cleaned: " cleaned ",
          provider_category: "local",
          disposition: "suppressed",
        }),
      ),
    );
    expect(
      await transcribeBatch({
        audio,
        durationMs: 1000,
        appContext: "Файл",
        skipPostProcess: true,
        fallbackError: "stream failed",
      }),
    ).toEqual({
      raw: "raw",
      cleaned: "cleaned",
      providerCategory: "local",
      disposition: "suppressed",
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(audio);
    expect(init.headers["x-app-context"]).toBe(encodeURIComponent("Файл"));
    expect(init.headers["x-skip-post-process"]).toBe("true");
  });
  it.each([
    [401, "cloud_auth_required", "cloudAuthRequired"],
    [429, "usage_exceeded", "usageExceeded"],
    [422, "local_whisper_setup_failed", "localWhisperSetupRequired"],
  ])("preserves actionable status %s in both paths", async (status, error, flag) => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error, detail: "setup detail" }), {
          status,
        }),
    );
    for (const fallbackError of [undefined, "stream failed"]) {
      const result = await transcribeBatch({
        audio,
        durationMs: 1000,
        fallbackError,
      });
      expect(result).toHaveProperty(flag, true);
      expect(result.error).toBeTruthy();
    }
  });
  it("retains the original streaming error when recovery also fails", async () => {
    fetchMock.mockResolvedValue(new Response("bad gateway", { status: 502 }));
    expect(
      (
        await transcribeBatch({
          audio,
          durationMs: 0,
          fallbackError: "stream failed",
        })
      ).error,
    ).toBe("stream failed");
  });
  it("returns an aborted disposition and forwards cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new DOMException("Aborted", "AbortError"));
    expect(
      await transcribeBatch({
        audio,
        durationMs: 0,
        signal: controller.signal,
      }),
    ).toEqual({ raw: "", cleaned: "", disposition: "aborted" });
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
