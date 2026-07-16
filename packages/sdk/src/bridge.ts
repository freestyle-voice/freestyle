/**
 * The bridge API injected into a plugin's UI page as `window.freestyle`. It is
 * the only privileged surface available to plugin web content: a proxied way
 * to call the local server API, trigger a small set of host actions, observe
 * host events, and read theme tokens. Everything else in the page is sandboxed
 * web content with no Node or IPC access.
 */
export interface FreestyleBridge {
  /**
   * Origin of the local Freestyle server the page is served from. Plugin UI is
   * served same-origin by the server now, so this is simply `location.origin`.
   */
  readonly serverUrl: string;
  /**
   * Request to a server API path, relative to {@link serverUrl}. Plugin UI is
   * served same-origin with the server, so this resolves the native `Response`
   * from a plain `fetch`.
   *
   * @example
   * const res = await window.freestyle.api("/api/transcribe", {
   *   method: "POST",
   *   body: formData,
   * });
   * if (res.ok) console.log(await res.json());
   */
  api(path: string, init?: RequestInit): Promise<Response>;
  /** Invoke a host action (copy text, show a toast, navigate, …). */
  invoke<C extends keyof HostActions>(
    channel: C,
    payload: HostActions[C],
  ): Promise<void>;
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
