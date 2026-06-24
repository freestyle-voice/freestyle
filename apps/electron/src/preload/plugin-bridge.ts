import type { FreestyleBridge, HostActions, HostEvents } from "@freestyle/sdk";
import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload injected into every plugin UI page (running in a sandboxed
 * WebContentsView). Exposes the `window.freestyle` bridge — the only privileged
 * surface available to plugin web content. Host config (server URL/token and
 * theme tokens) is passed as preload arguments by the view manager.
 */

interface BridgeConfig {
  serverUrl: string;
  token?: string;
  tokens?: Record<string, string>;
}

function readConfig(): BridgeConfig {
  // The view manager appends `--freestyle-config=<json>` to the preload args.
  const prefix = "--freestyle-config=";
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (!arg) return { serverUrl: "" };
  try {
    return JSON.parse(arg.slice(prefix.length)) as BridgeConfig;
  } catch {
    return { serverUrl: "" };
  }
}

const config = readConfig();

function applyTokens(tokens: Record<string, string> | undefined): void {
  if (!tokens) return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }
}

// Apply theme tokens as soon as the document is available.
if (config.tokens) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      applyTokens(config.tokens),
    );
  } else {
    applyTokens(config.tokens);
  }
}

const bridge: FreestyleBridge = {
  serverUrl: config.serverUrl,
  ...(config.token ? { token: config.token } : {}),

  api(path, init) {
    const url = `${config.serverUrl}${path}`;
    const headers = new Headers(init?.headers);
    if (config.token) headers.set("Authorization", `Bearer ${config.token}`);
    return fetch(url, { ...init, headers });
  },

  invoke<C extends keyof HostActions>(channel: C, payload: HostActions[C]) {
    return ipcRenderer.invoke("plugin-bridge:action", channel, payload);
  },

  on<E extends keyof HostEvents>(
    event: E,
    listener: (payload: HostEvents[E]) => void,
  ) {
    const wrapped = (_e: unknown, payload: HostEvents[E]): void =>
      listener(payload);
    ipcRenderer.on(`plugin-bridge:event:${event}`, wrapped);
    return () =>
      ipcRenderer.removeListener(`plugin-bridge:event:${event}`, wrapped);
  },
};

contextBridge.exposeInMainWorld("freestyle", bridge);
