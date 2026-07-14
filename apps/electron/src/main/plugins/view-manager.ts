import path from "node:path";
import { createAppLogger } from "@freestyle-voice/utils";
import { type BrowserWindow, WebContentsView } from "electron";
import { getDiscoveredPlugins, PLUGIN_SCHEME, pluginPageUrl } from "./ui.js";

const log = createAppLogger("plugins-ui");

/** Rect (in the window's content coordinates) where the plugin view sits. */
export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Server config injected into the plugin frame's bridge. */
export interface BridgeConfig {
  serverUrl: string;
}

/**
 * Hosts plugin UI pages in sandboxed {@link WebContentsView}s overlaid on the
 * dashboard window. The renderer reports the bounds of its placeholder; we size
 * the active view to match. Only one plugin page is visible at a time, but
 * previously visited pages are cached so switching back is instant (no white
 * flash or reload).
 */
export class PluginViewManager {
  /** Cache of loaded plugin views, keyed by `slug/pageId`. */
  private views = new Map<string, WebContentsView>();
  private window: BrowserWindow | null = null;
  /** The currently visible page key, or null when hidden. */
  private activeKey: string | null = null;
  /** Config for the current view, fetched by its preload over IPC on load. */
  private pendingConfig:
    | (BridgeConfig & { tokens?: Record<string, string> })
    | null = null;

  constructor(
    private readonly preloadPath: string,
    private readonly resolveConfig: () => BridgeConfig,
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
   * Show `slug`/`pageId` at `bounds`. Loads the page's entry over the
   * `freestyle-plugin://` scheme. Returns false when the page can't be found.
   *
   * Previously visited pages are kept alive in the cache so switching back is
   * instant — no white flash or reload. Only the first visit to a page incurs
   * a load.
   */
  show(
    slug: string,
    pageId: string,
    bounds: ViewBounds,
    tokens?: Record<string, string>,
  ): boolean {
    if (!this.window) return false;

    const plugin = getDiscoveredPlugins().find((p) => p.slug === slug);
    const page = plugin?.pages.find((p) => p.id === pageId);
    if (!plugin || !page) {
      log.warn(`unknown plugin page ${slug}/${pageId}`);
      return false;
    }

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

    // First visit — create a new view.
    const view = new WebContentsView({
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    // Paint the app background immediately so there's no white flash before the
    // page's own stylesheet loads.
    const bg = tokens?.["--background"];
    if (bg) view.setBackgroundColor(toHexColor(bg));
    this.pendingConfig = { ...this.resolveConfig(), tokens };
    this.views.set(key, view);
    this.window.contentView.addChildView(view);
    this.activeKey = key;
    this.setBounds(bounds);
    void view.webContents
      .loadURL(pluginPageUrl(plugin.slug, page.entry))
      .catch(() => {
        // Navigation can be superseded by a rapid page switch; ignore.
      });
    return true;
  }

  /** The config the current plugin view's preload should receive over IPC. */
  getConfig(): (BridgeConfig & { tokens?: Record<string, string> }) | null {
    return this.pendingConfig;
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
   * Discard all cached views so the next {@link show} reloads pages from
   * disk. Call after a plugin is installed, updated, or uninstalled — otherwise
   * cached views would re-attach stale plugin code.
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
    this.pendingConfig = null;
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

/** The scheme constant, re-exported for convenience. */
export { PLUGIN_SCHEME };
