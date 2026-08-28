import { contextBridge, ipcRenderer } from "electron";
import type { FreestyleBridge, HostActions } from "freestyle-voice";

/**
 * Preload injected into every plugin UI page. Plugin code runs in an isolated
 * WebContentsView and receives only this narrow host bridge.
 */

function applyTokens(tokens: Record<string, string> | undefined): void {
  if (!tokens) return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }
}

// Plugin pages are served from the local server origin, so only host actions
// and the dashboard's resolved design tokens need to cross the IPC boundary.
ipcRenderer
  .invoke("plugin-bridge:config")
  .then((value: { tokens?: Record<string, string> } | null) => {
    const tokens = value?.tokens;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => applyTokens(tokens));
    } else {
      applyTokens(tokens);
    }
  })
  .catch(() => {
    // A plugin can still use its own defaults when its host is unavailable.
  });

const bridge: FreestyleBridge = {
  get serverUrl() {
    return location.origin;
  },

  async api(path, init) {
    const res = await fetch(path, init);
    const buf = await res.arrayBuffer();
    const decode = (): string => new TextDecoder().decode(buf);
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      json: <T = unknown>() => JSON.parse(decode()) as T,
      text: () => decode(),
      arrayBuffer: () => structuredClone(buf),
    } as unknown as Response;
  },

  invoke<C extends keyof HostActions>(channel: C, payload: HostActions[C]) {
    return ipcRenderer.invoke("plugin-bridge:action", channel, payload);
  },
};

contextBridge.exposeInMainWorld("freestyle", bridge);
