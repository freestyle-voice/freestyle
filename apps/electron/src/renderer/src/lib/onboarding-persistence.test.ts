import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { saveOnboarding } from "./onboarding-persistence";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

describe("onboarding completion persistence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an HTTP failure so callers cannot mark the installation complete", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 503 }));
    await expect(saveOnboarding({ v: 2, done: true })).rejects.toThrow(
      "Couldn’t save",
    );
  });

  it("propagates network failures for retry", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Offline"));
    await expect(saveOnboarding({ v: 2, done: true })).rejects.toThrow(
      "Offline",
    );
  });

  it("waits for acknowledgment and preserves previous profile fields", async () => {
    let acknowledge!: (response: Response) => void;
    vi.mocked(apiFetch).mockReturnValue(
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
    );
    const saved = { v: 2 as const, done: true, name: "Sample", replayed: true };
    let completed = false;
    const pending = saveOnboarding(saved).then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(
      JSON.parse(String(vi.mocked(apiFetch).mock.calls[0]?.[1]?.body)),
    ).toEqual({ value: JSON.stringify(saved) });
    acknowledge(Response.json({ ok: true }));
    await pending;
    expect(completed).toBe(true);
  });
});
