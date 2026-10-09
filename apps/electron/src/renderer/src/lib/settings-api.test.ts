import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveSetting } from "./settings-api";

const { put } = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("./api", () => ({
  getClient: () => ({ api: { settings: { ":key": { $put: put } } } }),
}));

beforeEach(() => {
  put.mockReset();
});

describe("persisted hotkey settings", () => {
  it.each([
    "hotkey",
    "hotkey_mode",
    "remix_hotkey",
  ])("does not apply %s choices or native listeners after a failed save", async (key) => {
    const apply = vi.fn();
    put.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(saveSetting(key, "new choice").then(apply)).rejects.toThrow(
      "Could not save setting (HTTP 500)",
    );
    expect(apply).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledWith({
      param: { key },
      json: { value: "new choice" },
    });
  });

  it("waits for persistence before applying the new setting", async () => {
    let finish!: (response: Response) => void;
    put.mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    const apply = vi.fn();
    const saving = saveSetting("hotkey", "Alt+Space").then(apply);
    await Promise.resolve();
    expect(apply).not.toHaveBeenCalled();
    finish(new Response(null, { status: 204 }));
    await saving;
    expect(apply).toHaveBeenCalledOnce();
  });

  it("reports network failures without applying a choice", async () => {
    const apply = vi.fn();
    const failure = new TypeError("Failed to fetch");
    put.mockRejectedValue(failure);
    await expect(saveSetting("hotkey", "Alt+Space").then(apply)).rejects.toBe(
      failure,
    );
    expect(apply).not.toHaveBeenCalled();
  });
});
