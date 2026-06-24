import path from "node:path";
import { createAppLogger } from "@freestyle/utils";
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
  token?: string;
}

/**
 * Hosts a single plugin UI page in a sandboxed {@link WebContentsView} overlaid
 * on the dashboard window. The renderer reports the bounds of its placeholder;
 * we size the view to match. Only one plugin page is shown at a time.
 */
export class PluginViewManager {
  private view: WebContentsView | null = null;
  private window: BrowserWindow | null = null;
  private current: { pluginName: string; pageId: string } | null = null;

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
   * Show `pluginName`/`pageId` at `bounds`. Loads the page's entry over the
   * `freestyle-plugin://` scheme. Returns false when the page can't be found.
   * The view is recreated when the target page changes so the bridge config
   * (server URL/token/theme) is re-injected via preload args.
   */
  show(
    pluginName: string,
    pageId: string,
    bounds: ViewBounds,
    tokens?: Record<string, string>,
  ): boolean {
    if (!this.window) return false;

    const plugin = getDiscoveredPlugins().find((p) => p.name === pluginName);
    const page = plugin?.pages.find((p) => p.id === pageId);
    if (!plugin || !page) {
      log.warn(`unknown plugin page ${pluginName}/${pageId}`);
      return false;
    }

    const same =
      this.current?.pluginName === pluginName &&
      this.current?.pageId === pageId;
    if (same && this.view) {
      this.setBounds(bounds);
      return true;
    }

    // Recreate the view for a new page so preload args carry fresh config.
    this.destroyView();
    const config = JSON.stringify({ ...this.resolveConfig(), tokens });
    this.view = new WebContentsView({
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        additionalArguments: [`--freestyle-config=${config}`],
      },
    });
    this.window.contentView.addChildView(this.view);
    this.setBounds(bounds);
    this.current = { pluginName, pageId };
    void this.view.webContents.loadURL(pluginPageUrl(plugin.name, page.entry));
    return true;
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
  }
}

/** Absolute path to the plugin-bridge preload, resolved from the main bundle. */
export function pluginBridgePreloadPath(): string {
  return path.join(__dirname, "../preload/plugin-bridge.js");
}

/** The scheme constant, re-exported for convenience. */
export { PLUGIN_SCHEME };
