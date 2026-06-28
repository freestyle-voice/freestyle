/**
 * The bridge API injected into a plugin's UI page as `window.freestyle`. It is
 * the only privileged surface available to plugin web content: a proxied way
 * to call the local server API, trigger a small set of host actions, observe
 * host events, and read theme tokens. Everything else in the page is sandboxed
 * web content with no Node or IPC access.
 */
export interface FreestyleBridge {
  /** Base URL of the local Freestyle server (e.g. `http://127.0.0.1:4649`). */
  readonly serverUrl: string;
  /**
   * Request to a server API path. The `path` is appended to {@link serverUrl}.
   * The request is proxied through the host (the sandboxed page can't reach the
   * loopback server directly), so this resolves a lightweight
   * {@link FreestyleResponse} rather than a native `Response`.
   *
   * @example
   * const res = await window.freestyle.api("/api/transcribe", {
   *   method: "POST",
   *   body: formData,
   * });
   * if (res.ok) console.log(await res.json());
   */
  api(path: string, init?: RequestInit): Promise<FreestyleResponse>;
  /** Invoke a host action (copy text, show a toast, navigate, …). */
  invoke<C extends keyof HostActions>(
    channel: C,
    payload: HostActions[C],
  ): Promise<void>;
}

/**
 * The result of a {@link FreestyleBridge.api} call. A minimal, host-bridgeable
 * stand-in for `Response` exposing the parts plugins need.
 */
export interface FreestyleResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  json<T = unknown>(): Promise<T>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Actions a plugin page can ask the host to perform. */
export interface HostActions {
  /** Copy text to the clipboard. */
  copy: { text: string };
  /** Show a transient notification. */
  toast: { message: string; variant?: "info" | "success" | "error" };
  /** Navigate the host to an app route (e.g. back to the Plugins hub). */
  navigate: { to: string };
}

declare global {
  interface Window {
    /** Present only inside a plugin UI page hosted by Freestyle. */
    freestyle?: FreestyleBridge;
  }
}
