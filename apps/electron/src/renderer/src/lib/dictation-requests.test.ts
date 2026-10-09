import { describe, expect, it, vi } from "vitest";
import { transcribeBatch } from "./batch-transcription";
import { DictationRequests } from "./dictation-requests";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({
  apiFetch: fetchMock,
  getApiBase: () => "http://localhost",
  isRemoteServer: () => false,
}));

describe("dictation request ownership", () => {
  it("aborts every outstanding segment/cleanup request on cancel", async () => {
    const group = new DictationRequests();
    const signals: AbortSignal[] = [];
    const run = () =>
      group.run((signal) => {
        signals.push(signal);
        return new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
      });
    const batch = [run(), run(), run()];
    group.cancel();
    await Promise.all(batch);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    await group.run(async (signal) => expect(signal.aborted).toBe(false));
  });

  it("rejects late delivery from canceled work even after a new session starts", async () => {
    const group = new DictationRequests();
    const epoch = group.current();
    let finish!: (text: string) => void;
    const output = vi.fn();
    const oldDrain = group
      .run(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      )
      .then((text) => {
        if (group.isCurrent(epoch)) output(text);
      });
    group.cancel();
    await group.run(async () => "new session");
    finish("old text");
    await oldDrain;
    expect(output).not.toHaveBeenCalled();
  });

  it("returns a retryable timeout error and reuses captured WAV on retry", async () => {
    const audio = new Blob(["captured WAV"]);
    const controller = new AbortController();
    controller.abort(new DOMException("deadline", "TimeoutError"));
    const timedOut = await transcribeBatch({
      audio,
      durationMs: 1000,
      signal: controller.signal,
    });
    expect(timedOut.error).toContain("timed out");
    expect(timedOut.disposition).toBeUndefined();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ raw: "retried text" })),
    );
    const group = new DictationRequests();
    expect(
      (
        await group.run((signal) =>
          transcribeBatch({ audio, durationMs: 1000, signal }),
        )
      ).raw,
    ).toBe("retried text");
    expect(fetchMock.mock.calls.at(-1)?.[1].body).toBe(audio);
  });

  it("drops a response that completes after its cancellation", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      return new Response(JSON.stringify({ raw: "late text" }));
    });
    expect(
      await transcribeBatch({
        audio: new Blob(["WAV"]),
        durationMs: 1000,
        signal: controller.signal,
      }),
    ).toEqual({ raw: "", cleaned: "", disposition: "aborted" });
  });
});
