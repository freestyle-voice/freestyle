import { afterEach, describe, expect, it, vi } from "vitest";
import {
  postProcessWithFreestyleCloud,
  transcribeWithFreestyleCloud,
} from "../src/lib/freestyle-cloud.js";

afterEach(() => vi.unstubAllGlobals());
describe("cloud dictation cancellation", () => {
  it.each([
    "transcribe",
    "cleanup",
  ])("aborts the %s fetch while preserving the cloud deadline", async (kind) => {
    const controller = new AbortController();
    const fetch = vi.fn(async (_url, init) => {
      expect(init.signal).not.toBe(controller.signal);
      controller.abort();
      expect(init.signal.aborted).toBe(true);
      throw init.signal.reason;
    });
    vi.stubGlobal("fetch", fetch);
    const result =
      kind === "transcribe"
        ? transcribeWithFreestyleCloud({
            token: "test",
            audio: new Uint8Array([1]),
            mode: "combined",
            signal: controller.signal,
          })
        : postProcessWithFreestyleCloud({
            token: "test",
            text: "raw text",
            signal: controller.signal,
          });
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
