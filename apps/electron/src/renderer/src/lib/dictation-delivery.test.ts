import { describe, expect, it, vi } from "vitest";
import { deliverDictation } from "./dictation-delivery";
import { DictationRequests } from "./dictation-requests";

describe("committed native output", () => {
  it("announces deferred delivery once after cosmetic reset and a new pill session", async () => {
    const requests = new DictationRequests();
    const epoch = requests.current();
    let finish!: () => void;
    let pillState = "transcribing";
    const done = vi.fn();
    const capture = vi.fn();
    const delivery = deliverDictation({
      dispatch: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      onDispatched: () => {
        pillState = "delivered";
      },
      onDelivered: () => {
        done();
        capture();
      },
    }).finally(() => {
      if (requests.isCurrent(epoch)) pillState = "idle";
    });
    expect(pillState).toBe("delivered");
    expect(done).not.toHaveBeenCalled();
    requests.cancel();
    pillState = "recording";
    finish();
    await delivery;
    expect(done).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledOnce();
    expect(pillState).toBe("recording");
  });
  it("does not announce a native delivery that rejects", async () => {
    const done = vi.fn();
    await expect(
      deliverDictation({
        dispatch: async () => {
          throw new Error("paste failed");
        },
        onDispatched: vi.fn(),
        onDelivered: done,
      }),
    ).rejects.toThrow("paste failed");
    expect(done).not.toHaveBeenCalled();
  });
});
