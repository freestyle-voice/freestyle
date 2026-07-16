import path from "node:path";
import { type BrowserWindow, session, WebContentsView } from "electron";
import { bearerAuthHeaders } from "../../shared/server-auth";

/** Rect (in the window's content coordinates) where the plugin view sits. */
export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Hosts plugin UI pages in sandboxed {@link WebContentsView}s overlaid on the
 * dashboard window. The renderer reports the bounds of its placeholder; we size
 * the active view to match. Only one plugin page is visible at a time, but
 * previously visited pages are cached so switching back is instant (no white
 * flash or reload).
 *
 * Pages are loaded same-origin from the loopback server
 * (`GET /api/plugins/:slug/ui/<entry>`), and each plugin gets its own Electron
 * `session` partition so one plugin's page can't read another's
 * storage/cookies even though they share the loopback origin.
 */
export class PluginViewManager {
  /** Cache of loaded plugin views, keyed by `slug/pageId`. */
  private views = new Map<string, WebContentsView>();
  private window: BrowserWindow | null = null;
  /** The currently visible page key, or null when hidden. */
  private activeKey: string | null = null;
  /** Theme tokens for the current view, fetched by its preload over IPC. */
  private pendingTokens: Record<string, string> | undefined;

  /** Plugin session partitions we've already installed the auth filter on. */
  private authInstalledPartitions = new Set<string>();

  constructor(
    private readonly preloadPath: string,
    private readonly getServerBaseUrl: () => string,
    private readonly getServerToken: () => string,
  ) {}

  /** Attach to the dashboard window; call once when that window is created. */
  attachWindow(window: BrowserWindow): void {
    this.window = window;
    window.on("closed", () => {
      this.window = null;
      this.destroyAll();
    });
  }

  /**
   * Show `slug`/`pageId` at `bounds`, loading `entry` from the server over the
   * loopback origin. Returns false when there's no window to attach to.
   *
   * Previously visited pages are kept alive in the cache so switching back is
   * instant — no white flash or reload. Only the first visit to a page incurs
   * a load.
   */
  show(
    slug: string,
    pageId: string,
    entry: string,
    bounds: ViewBounds,
    tokens?: Record<string, string>,
  ): boolean {
    if (!this.window) return false;

    const key = `${slug}/${pageId}`;

    // Detach the currently active view (if any and different from target).
    if (this.activeKey && this.activeKey !== key) {
      this.detachView(this.activeKey);
    }

    // Re-attach from cache if available.
    const cached = this.views.get(key);
    if (cached) {
      if (this.activeKey !== key) {
        this.window.contentView.addChildView(cached);
        this.activeKey = key;
      }
      this.setBounds(bounds);
      return true;
    }

    // First visit — create a new view in this plugin's own session partition.
    const partition = `persist:plugin-${slug}`;
    this.installServerAuth(partition);
    const view = new WebContentsView({
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        partition,
      },
    });
    // Paint the app background immediately so there's no white flash before the
    // page's own stylesheet loads.
    const bg = tokens?.["--background"];
    if (bg) view.setBackgroundColor(toHexColor(bg));
    this.pendingTokens = tokens;
    this.views.set(key, view);
    this.window.contentView.addChildView(view);
    this.activeKey = key;
    this.setBounds(bounds);
    const url = `${this.getServerBaseUrl()}/api/plugins/${encodeURIComponent(
      slug,
    )}/ui/${entry.replace(/^\/+/, "")}`;
    void view.webContents.loadURL(url).catch(() => {
      // Navigation can be superseded by a rapid page switch; ignore.
    });
    return true;
  }

  /**
   * Install a request filter on the plugin's session partition that attaches
   * the configured server's bearer token to requests bound for the server
   * origin. A plugin page runs inside a `WebContentsView` and can't set an
   * `Authorization` header on its own `fetch()`/asset loads, so without this a
   * token-protected *remote* server would reject the page and its API calls.
   *
   * The token is read per-request (not captured), so it always reflects the
   * current server target after a `server:changed` switch. No-op for the local
   * server / no-token case, and scoped to the server origin so a plugin page
   * that talks to a third-party API never leaks the token.
   *
   * Installed once per partition; Electron persists the session across views.
   */
  private installServerAuth(partition: string): void {
    if (this.authInstalledPartitions.has(partition)) return;
    this.authInstalledPartitions.add(partition);

    const sess = session.fromPartition(partition);
    sess.webRequest.onBeforeSendHeaders((details, callback) => {
      const token = this.getServerToken();
      if (!token || !this.isServerOrigin(details.url)) {
        callback({ requestHeaders: details.requestHeaders });
        return;
      }
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          ...bearerAuthHeaders(token),
        },
      });
    });
  }

  /** True when `url` targets the current server's origin. */
  private isServerOrigin(url: string): boolean {
    try {
      return new URL(url).origin === new URL(this.getServerBaseUrl()).origin;
    } catch {
      return false;
    }
  }

  /** The theme tokens the current plugin view's preload should receive. */
  getTokens(): { tokens?: Record<string, string> } {
    return this.pendingTokens ? { tokens: this.pendingTokens } : {};
  }

  /** Update the active view's position/size (on resize, scroll, or layout change). */
  setBounds(bounds: ViewBounds): void {
    if (!this.activeKey) return;
    const view = this.views.get(this.activeKey);
    view?.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
  }

  /**
   * Detach the current plugin view from the window without destroying it.
   * The view stays alive in the cache so re-opening is instant (no reload).
   */
  hide(): void {
    if (!this.activeKey) return;
    this.detachView(this.activeKey);
    this.activeKey = null;
  }

  /**
   * Discard all cached views so the next {@link show} reloads pages from the
   * server. Call after a plugin is installed, updated, or uninstalled —
   * otherwise cached views would re-attach stale plugin code.
   */
  invalidate(): void {
    this.destroyAll();
  }

  /** Detach a single view from the window without destroying it. */
  private detachView(key: string): void {
    const view = this.views.get(key);
    if (!view) return;
    if (this.window && !this.window.isDestroyed()) {
      this.window.contentView.removeChildView(view);
    }
  }

  /** Destroy all cached views. */
  private destroyAll(): void {
    for (const [, view] of this.views) {
      if (this.window && !this.window.isDestroyed()) {
        this.window.contentView.removeChildView(view);
      }
      view.webContents.close();
    }
    this.views.clear();
    this.activeKey = null;
    this.pendingTokens = undefined;
  }
}

/** Normalize a CSS color token to a `#RRGGBB` hex Electron accepts. */
function toHexColor(value: string): string {
  const v = value.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : "#000000";
}

/** Absolute path to the plugin-bridge preload, resolved from the main bundle. */
export function pluginBridgePreloadPath(): string {
  return path.join(__dirname, "../preload/plugin-bridge.js");
}
