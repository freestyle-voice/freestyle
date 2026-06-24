import type { FreestyleBridge, HostActions } from "@freestyle/sdk";
import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload injected into every plugin UI page (running in a sandboxed
 * WebContentsView). Exposes the `window.freestyle` bridge — the only privileged
 * surface available to plugin web content. Host config (server URL/token and
 * theme tokens) is fetched from the main process over IPC, keeping the token
 * out of process arguments.
 */

interface BridgeConfig {
  serverUrl: string;
  token?: string;
  tokens?: Record<string, string>;
}

let config: BridgeConfig = { serverUrl: "" };

function applyTokens(tokens: Record<string, string> | undefined): void {
  if (!tokens) return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }
}

// Fetch config as early as possible and apply theme tokens once the document
// is ready. The bridge methods read `config` lazily, so they work regardless of
// when this resolves.
const ready = ipcRenderer
  .invoke("plugin-bridge:config")
  .then((value: BridgeConfig | null) => {
    if (value) config = value;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () =>
        applyTokens(config.tokens),
      );
    } else {
      applyTokens(config.tokens);
    }
  })
  .catch(() => {
    /* leave defaults */
  });

const bridge: FreestyleBridge = {
  get serverUrl() {
    return config.serverUrl;
  },
  get token() {
    return config.token;
  },

  async api(path, init) {
    await ready;
    const url = `${config.serverUrl}${path}`;
    const headers = new Headers(init?.headers);
    if (config.token) headers.set("Authorization", `Bearer ${config.token}`);
    return fetch(url, { ...init, headers });
  },

  invoke<C extends keyof HostActions>(channel: C, payload: HostActions[C]) {
    return ipcRenderer.invoke("plugin-bridge:action", channel, payload);
  },
};

contextBridge.exposeInMainWorld("freestyle", bridge);
