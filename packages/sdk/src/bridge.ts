/**
 * The bridge API injected into a plugin's UI page as `window.freestyle`. It is
 * the only privileged surface available to plugin web content: a pre-authed way
 * to call the local server API, trigger a small set of host actions, observe
 * host events, and read theme tokens. Everything else in the page is sandboxed
 * web content with no Node or IPC access.
 */
export interface FreestyleBridge {
  /** Base URL of the local Freestyle server (e.g. `http://127.0.0.1:4649`). */
  readonly serverUrl: string;
  /** Bearer token for the server API, when one is configured. */
  readonly token?: string;
  /**
   * Pre-authed `fetch` to a server API path. The `path` is appended to
   * {@link serverUrl}; the bearer token (if any) is attached automatically.
   *
   * @example
   * const res = await window.freestyle.api("/api/transcribe", {
   *   method: "POST",
   *   body: formData,
   * });
   */
  api(path: string, init?: RequestInit): Promise<Response>;
  /** Invoke a host action (paste text, show a toast, navigate, …). */
  invoke<C extends keyof HostActions>(
    channel: C,
    payload: HostActions[C],
  ): Promise<void>;
  /** Subscribe to a host event; returns an unsubscribe function. */
  on<E extends keyof HostEvents>(
    event: E,
    listener: (payload: HostEvents[E]) => void,
  ): () => void;
}

/** Actions a plugin page can ask the host to perform. */
export interface HostActions {
  /** Paste text into the user's focused application. */
  paste: { text: string };
  /** Copy text to the clipboard. */
  copy: { text: string };
  /** Show a transient notification. */
  toast: { message: string; variant?: "info" | "success" | "error" };
  /** Navigate the host to an app route (e.g. back to the Plugins hub). */
  navigate: { to: string };
}

/** Events a plugin page can subscribe to. */
export interface HostEvents {
  /** The host theme changed; payload carries the new design tokens. */
  themechange: { tokens: Record<string, string>; dark: boolean };
}

declare global {
  interface Window {
    /** Present only inside a plugin UI page hosted by Freestyle. */
    freestyle?: FreestyleBridge;
  }
}
