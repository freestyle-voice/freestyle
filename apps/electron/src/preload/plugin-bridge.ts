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

/** An IPC-serializable form of a request body (see also main's ui-host). */
type SerializedBody =
  | { kind: "none" }
  | { kind: "text"; value: string }
  | { kind: "binary"; data: ArrayBuffer; type: string }
  | {
      kind: "form";
      fields: Array<
        | { type: "text"; name: string; value: string }
        | {
            type: "file";
            name: string;
            filename: string;
            mime: string;
            data: ArrayBuffer;
          }
      >;
    };

/** Convert a fetch body into an IPC-serializable shape for the main proxy. */
async function serializeBody(
  body: BodyInit | null | undefined,
): Promise<SerializedBody> {
  if (body == null) return { kind: "none" };
  if (typeof body === "string") return { kind: "text", value: body };
  if (body instanceof FormData) {
    const fields: Extract<SerializedBody, { kind: "form" }>["fields"] = [];
    for (const [name, value] of body.entries()) {
      if (typeof value === "string") {
        fields.push({ type: "text", name, value });
      } else {
        fields.push({
          type: "file",
          name,
          filename: value.name,
          mime: value.type,
          data: await value.arrayBuffer(),
        });
      }
    }
    return { kind: "form", fields };
  }
  if (body instanceof Blob) {
    return { kind: "binary", data: await body.arrayBuffer(), type: body.type };
  }
  if (body instanceof ArrayBuffer) {
    return { kind: "binary", data: body, type: "" };
  }
  if (ArrayBuffer.isView(body)) {
    const view = body as ArrayBufferView;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return { kind: "binary", data: copy.buffer, type: "" };
  }
  // Fallback: stringify anything else.
  return { kind: "text", value: String(body) };
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
    // Proxy the request through the main process. A direct fetch from this
    // sandboxed `freestyle-plugin://` (secure) origin to the loopback
    // `http://127.0.0.1` server would be blocked as mixed content, so main
    // (Node, no such restriction) performs the actual request.
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });

    const body = await serializeBody(init?.body);
    const res = (await ipcRenderer.invoke("plugin-bridge:fetch", {
      path,
      method: init?.method ?? "GET",
      headers,
      body,
    })) as {
      ok: boolean;
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: ArrayBuffer;
    };

    // A native Response can't survive the contextBridge boundary (its prototype
    // is stripped), so return a plain object with method members — contextBridge
    // proxies functions, so json()/text()/arrayBuffer() work in the page.
    const bytes = res.body;
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
      arrayBuffer: () => Promise.resolve(bytes),
      text: () => Promise.resolve(new TextDecoder().decode(bytes)),
      json: () => Promise.resolve(JSON.parse(new TextDecoder().decode(bytes))),
    };
  },

  invoke<C extends keyof HostActions>(channel: C, payload: HostActions[C]) {
    return ipcRenderer.invoke("plugin-bridge:action", channel, payload);
  },
};

contextBridge.exposeInMainWorld("freestyle", bridge);
