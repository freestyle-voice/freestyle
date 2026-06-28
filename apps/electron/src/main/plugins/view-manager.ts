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
 * Hosts a single plugin UI page in a sandboxed {@link WebContentsView} overlaid
 * on the dashboard window. The renderer reports the bounds of its placeholder;
 * we size the view to match. Only one plugin page is shown at a time.
 */
export class PluginViewManager {
  private view: WebContentsView | null = null;
  private window: BrowserWindow | null = null;
  private current: { slug: string; pageId: string } | null = null;
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
      this.destroyView();
    });
  }

  /**
   * Show `slug`/`pageId` at `bounds`. Loads the page's entry over the
   * `freestyle-plugin://` scheme. Returns false when the page can't be found.
   * The view is recreated when the target page changes so its preload picks up
   * the current bridge config (fetched over IPC).
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

    const same = this.current?.slug === slug && this.current?.pageId === pageId;
    if (same && this.view) {
      this.setBounds(bounds);
      return true;
    }

    // Recreate the view for a new page so the bridge config is re-injected.
    this.destroyView();
    this.view = new WebContentsView({
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
    if (bg) this.view.setBackgroundColor(toHexColor(bg));
    this.pendingConfig = { ...this.resolveConfig(), tokens };
    this.window.contentView.addChildView(this.view);
    this.setBounds(bounds);
    this.current = { slug, pageId };
    void this.view.webContents
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

  /** Update the view's position/size (on resize, scroll, or layout change). */
  setBounds(bounds: ViewBounds): void {
    this.view?.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
  }

  /** Hide and tear down the current plugin view (on navigating away). */
  hide(): void {
    this.destroyView();
  }

  private destroyView(): void {
    if (!this.view) return;
    if (this.window && !this.window.isDestroyed()) {
      this.window.contentView.removeChildView(this.view);
    }
    this.view.webContents.close();
    this.view = null;
    this.current = null;
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
