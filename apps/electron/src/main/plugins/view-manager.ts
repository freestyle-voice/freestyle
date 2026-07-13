import path from "node:path";
import { type BrowserWindow, WebContentsView } from "electron";

/** Rect (in the window's content coordinates) where the plugin view sits. */
export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Hosts a single plugin UI page in a sandboxed {@link WebContentsView} overlaid
 * on the dashboard window. The renderer reports the bounds of its placeholder;
 * we size the view to match. Only one plugin page is shown at a time.
 *
 * Pages are loaded same-origin from the loopback server
 * (`GET /api/plugins/:slug/ui/<entry>`), and each plugin gets its own Electron
 * `session` partition so one plugin's page can't read another's
 * storage/cookies even though they share the loopback origin.
 */
export class PluginViewManager {
  private view: WebContentsView | null = null;
  private window: BrowserWindow | null = null;
  private current: { slug: string; pageId: string } | null = null;
  /** Whether the view is currently attached (visible) in the window. */
  private attached = false;
  /** Theme tokens for the current view, fetched by its preload over IPC. */
  private pendingTokens: Record<string, string> | undefined;

  constructor(
    private readonly preloadPath: string,
    private readonly getServerBaseUrl: () => string,
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
   * Show `slug`/`pageId` at `bounds`, loading `entry` from the server over the
   * loopback origin. Returns false when there's no window to attach to.
   *
   * When the same page is re-shown (e.g. navigating back after hide), the
   * existing view is re-attached without recreating it — no white flash or
   * reload. The view is only destroyed and rebuilt when switching to a
   * different plugin page.
   */
  show(
    slug: string,
    pageId: string,
    entry: string,
    bounds: ViewBounds,
    tokens?: Record<string, string>,
  ): boolean {
    if (!this.window) return false;

    const same = this.current?.slug === slug && this.current?.pageId === pageId;

    // Same page, view still alive — just re-attach if hidden and update bounds.
    if (same && this.view) {
      if (!this.attached) {
        this.window.contentView.addChildView(this.view);
        this.attached = true;
      }
      this.setBounds(bounds);
      return true;
    }

    // Different page — destroy the old view and create a new one, in this
    // plugin's own session partition.
    this.destroyView();
    this.view = new WebContentsView({
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        partition: `persist:plugin-${slug}`,
      },
    });
    // Paint the app background immediately so there's no white flash before the
    // page's own stylesheet loads.
    const bg = tokens?.["--background"];
    if (bg) this.view.setBackgroundColor(toHexColor(bg));
    this.pendingTokens = tokens;
    this.window.contentView.addChildView(this.view);
    this.attached = true;
    this.setBounds(bounds);
    this.current = { slug, pageId };
    const url = `${this.getServerBaseUrl()}/api/plugins/${encodeURIComponent(
      slug,
    )}/ui/${entry.replace(/^\/+/, "")}`;
    void this.view.webContents.loadURL(url).catch(() => {
      // Navigation can be superseded by a rapid page switch; ignore.
    });
    return true;
  }

  /** The theme tokens the current plugin view's preload should receive. */
  getTokens(): { tokens?: Record<string, string> } {
    return this.pendingTokens ? { tokens: this.pendingTokens } : {};
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

  /**
   * Detach the current plugin view from the window without destroying it.
   * The view stays alive so re-opening the same page is instant (no reload).
   */
  hide(): void {
    if (!this.view || !this.attached) return;
    if (this.window && !this.window.isDestroyed()) {
      this.window.contentView.removeChildView(this.view);
    }
    this.attached = false;
  }

  /**
   * Discard any cached view so the next {@link show} reloads the page from the
   * server. Call after a plugin is installed, updated, or uninstalled.
   */
  invalidate(): void {
    this.destroyView();
  }

  private destroyView(): void {
    if (!this.view) return;
    if (this.attached && this.window && !this.window.isDestroyed()) {
      this.window.contentView.removeChildView(this.view);
    }
    this.view.webContents.close();
    this.view = null;
    this.current = null;
    this.attached = false;
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
