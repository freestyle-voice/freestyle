import { contextBridge, ipcRenderer } from "electron";
import type {
  FreestyleBridge,
  HostActions,
  PillEvent,
  PillPanelBridge,
} from "freestyle-voice";

/**
 * Preload injected into every plugin UI page (running in a sandboxed
 * WebContentsView). Exposes the `window.freestyle` bridge — the only privileged
 * surface available to plugin web content.
 *
 * Plugin UI is served same-origin from the loopback server now (via
 * `GET /api/plugins/:slug/ui/*`), so `api()` is a plain `fetch` against the
 * page's own origin — no IPC fetch-proxy. Only host actions (`copy`, `toast`,
 * `navigate`) and theme-token delivery still cross into the main process.
 */

function applyTokens(tokens: Record<string, string> | undefined): void {
  if (!tokens) return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }
  // Toggle a `light` class on <html> so plugin CSS can adapt.  We derive the
  // mode from the --background token: parse the hex and check luminance.
  const bg = tokens["--background"];
  if (bg) {
    const hex = bg.replace("#", "");
    if (hex.length >= 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
      const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
      const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
      // Relative luminance (sRGB)
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > 0.5) {
        root.classList.add("light");
      } else {
        root.classList.remove("light");
      }
    }
  }
}

// Theme tokens are the only host config the page still needs; fetch them early
// and apply once the document is ready.
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
    /* leave defaults */
  });

const pillBridge: PillPanelBridge = {
  getState() {
    return ipcRenderer.invoke("pill-panel:state");
  },
  subscribe(callback: (event: PillEvent) => void) {
    const handler = (_: unknown, event: PillEvent): void => callback(event);
    ipcRenderer.on("pill-panel:event", handler);
    return () => ipcRenderer.removeListener("pill-panel:event", handler);
  },
  expand() {
    return ipcRenderer.invoke("pill-panel:expand").then(() => {});
  },
  collapse() {
    return ipcRenderer.invoke("pill-panel:collapse").then(() => {});
  },
  setBadge(text: string | null) {
    return ipcRenderer
      .invoke("plugin-bridge:action", "pill:set-badge", { text })
      .then(() => {});
  },
};

const bridge: FreestyleBridge = {
  get serverUrl() {
    return location.origin;
  },

  async api(path, init) {
    // Same-origin fetch: the page is served from the loopback server, so a
    // relative path resolves against it directly.  The native Response is NOT
    // structured-cloneable, so contextBridge would strip it to an empty object.
    // Consume the body here (in the preload's isolated world) and return a
    // plain object whose properties and methods survive the boundary.
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

  pill: pillBridge,
};

contextBridge.exposeInMainWorld("freestyle", bridge);
