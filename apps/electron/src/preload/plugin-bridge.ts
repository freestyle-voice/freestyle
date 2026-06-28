import { contextBridge, ipcRenderer } from "electron";
import type { FreestyleBridge, HostActions } from "freestyle-voice";
import type {
  PluginFetchResponse,
  SerializedBody,
} from "../shared/bridge-protocol";

/**
 * Preload injected into every plugin UI page (running in a sandboxed
 * WebContentsView). Exposes the `window.freestyle` bridge — the only privileged
 * surface available to plugin web content. Host config (server URL and theme
 * tokens) is fetched from the main process over IPC.
 */

interface BridgeConfig {
  serverUrl: string;
  tokens?: Record<string, string>;
}

/**
 * Convert a fetch body into an IPC-serializable shape for the main proxy.
 *
 * The body originates in the page's main world while this runs in the preload's
 * isolated world — a different JS realm — so `instanceof FormData`/`Blob` is
 * unreliable. Detect these types structurally (duck-typing) instead.
 */
async function serializeBody(body: unknown): Promise<SerializedBody> {
  if (body == null) return { kind: "none" };
  if (typeof body === "string") return { kind: "text", value: body };

  // FormData: has an iterable entries() yielding [name, value] pairs.
  if (isFormDataLike(body)) {
    const fields: Extract<SerializedBody, { kind: "form" }>["fields"] = [];
    for (const [name, value] of body.entries()) {
      if (typeof value === "string") {
        fields.push({ type: "text", name, value });
      } else {
        fields.push({
          type: "file",
          name,
          filename: typeof value.name === "string" ? value.name : "file",
          mime: typeof value.type === "string" ? value.type : "",
          data: await value.arrayBuffer(),
        });
      }
    }
    return { kind: "form", fields };
  }

  // Blob/File: has arrayBuffer() + size.
  if (isBlobLike(body)) {
    return {
      kind: "binary",
      data: await body.arrayBuffer(),
      type: typeof body.type === "string" ? body.type : "",
    };
  }

  // ArrayBuffer (cross-realm safe: check byteLength, exclude typed-array views).
  if (ArrayBuffer.isView(body)) {
    const view = body as ArrayBufferView;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return { kind: "binary", data: copy.buffer, type: "" };
  }
  if (isArrayBufferLike(body)) {
    return { kind: "binary", data: body, type: "" };
  }
  return { kind: "text", value: String(body) };
}

function isArrayBufferLike(value: unknown): value is ArrayBuffer {
  return (
    value instanceof ArrayBuffer ||
    (typeof value === "object" &&
      value !== null &&
      Object.prototype.toString.call(value) === "[object ArrayBuffer]")
  );
}

interface FormDataLike {
  entries(): IterableIterator<[string, string | BlobLike]>;
}
interface BlobLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  type?: unknown;
  name?: unknown;
  size: number;
}

function isFormDataLike(value: unknown): value is FormDataLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { entries?: unknown }).entries === "function" &&
    typeof (value as { getAll?: unknown }).getAll === "function"
  );
}

function isBlobLike(value: unknown): value is BlobLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function" &&
    typeof (value as { size?: unknown }).size === "number"
  );
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
    })) as PluginFetchResponse;

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
      json: <T = unknown>(): Promise<T> => {
        const str = new TextDecoder().decode(bytes);
        return Promise.resolve(str ? (JSON.parse(str) as T) : (null as T));
      },
    };
  },

  invoke<C extends keyof HostActions>(channel: C, payload: HostActions[C]) {
    return ipcRenderer.invoke("plugin-bridge:action", channel, payload);
  },
};

contextBridge.exposeInMainWorld("freestyle", bridge);
