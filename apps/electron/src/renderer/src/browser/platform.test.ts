import { describe, expect, it, vi } from "vitest";
import { type BrowserHost, createBrowserApi } from "./platform";

function setup() {
  const data = new Map<string, string>();
  const host: BrowserHost = {
    storage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
    },
    openExternal: vi.fn(() => true),
    navigate: vi.fn(),
    unsupported: vi.fn(),
    writeClipboard: vi.fn(async () => {}),
    readClipboard: vi.fn(async () => "copied text"),
    micPermission: vi.fn(async () => "prompt"),
    requestMic: vi.fn(async () => "granted"),
  };
  return {
    host,
    data,
    api: createBrowserApi(host, {
      platform: "linux",
      version: "test",
      apiBase: "http://127.0.0.1:5173",
    }),
  };
}

describe("browser platform", () => {
  it("does not pretend native actions succeeded", async () => {
    const { api, host } = setup();
    expect(await api.remixSelectAll()).toEqual({
      ok: false,
      reason: "desktop_required",
    });
    expect(await api.pasteRemixResult("hello")).toBe(false);
    await expect(api.pasteText("hello")).rejects.toThrow("desktop");
    expect(await api.checkAccessibilityPermission()).toBe(false);
    api.installUpdate();
    expect(host.unsupported).toHaveBeenCalled();
  });

  it("only opens http, https and mailto links", async () => {
    const { api, host } = setup();
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "app://renderer",
      "invalid",
    ]) {
      expect(await api.openExternal(url)).toBe(false);
    }
    expect(host.openExternal).not.toHaveBeenCalled();
    expect(await api.openExternal("https://example.test/path")).toBe(true);
    expect(await api.openExternal("mailto:help@example.test")).toBe(true);
  });

  it("uses same-origin API configuration without persisting credentials", async () => {
    const { api, data } = setup();
    expect(await api.getServerUrl()).toBe("http://127.0.0.1:5173");
    expect(await api.getServerToken()).toBe("");
    expect(await api.setServerToken("secret")).toBe("");
    expect(await api.setServerUrl("https://other.test")).toBe("");
    expect([...data.values()]).not.toContain("secret");
  });

  it("persists local display titles and tolerates corrupt or inaccessible storage", async () => {
    const { api, data, host } = setup();
    await api.setRemixSessionTitle("thread-1", "Browser title");
    expect(await api.getRemixSessionTitles()).toEqual({
      "thread-1": "Browser title",
    });
    await api.setRemixSessionTitle("thread-1", null);
    expect(await api.getRemixSessionTitles()).toEqual({});
    data.set("freestyle.browser.titles", "not JSON");
    expect(await api.getRemixSessionTitles()).toEqual({});
    host.storage.getItem = () => {
      throw new Error("blocked");
    };
    host.storage.setItem = () => {
      throw new Error("blocked");
    };
    expect(await api.getRemixSessionTitles()).toEqual({});
    expect(await api.setRemixSessionTitle("thread-1", "New")).toBe(false);
  });

  it("unsubscribes events and uses browser clipboard and microphone permissions", async () => {
    const { api, host } = setup();
    const listener = vi.fn();
    const off = api.onTranscriptionDone(listener);
    api.sendTranscriptionDone();
    off();
    api.sendTranscriptionDone();
    expect(listener).toHaveBeenCalledTimes(1);
    await api.copyText("hello");
    expect(host.writeClipboard).toHaveBeenCalledWith("hello");
    expect(await api.requestMicPermission()).toBe("granted");
    expect(await api.remixGetClipboard()).toEqual({
      ok: true,
      text: "copied text",
    });
  });
});
