import path from "node:path";
import { createAppLogger } from "@freestyle-voice/utils";
import {
  type BrowserWindow,
  ipcMain,
  screen,
  session,
  WebContentsView,
} from "electron";
import type { HostActions, PillEvent, PillState } from "freestyle-voice";
import { bearerAuthHeaders } from "../../shared/server-auth.js";

const log = createAppLogger("pill-panel");

/** The pill chrome height (px) — the panel sits below (or above) it. */
const PILL_CHROME_HEIGHT = 90;

/** Gap between pill chrome and the panel (px). */
const PANEL_GAP = 4;

interface PillPanelConfig {
  slug: string;
  panelId: string;
  entry: string;
  expand: { width: number; height: number };
}

/**
 * Manages a single plugin's pill panel as a {@link WebContentsView} overlaid on
 * the pill window. Handles expand/collapse by resizing the pill window, toggling
 * `focusable`, and positioning the panel relative to the pill chrome.
 *
 * The view is created eagerly on {@link configure} and loaded off-screen so it's
 * ready before the first event arrives. Events emitted before the page finishes
 * loading are buffered and flushed on load, so a `transcriptReady` fired the
 * instant a dictation is consumed is never dropped.
 *
 * Only one pill panel plugin is active at a time (single-owner model).
 */
export class PillPanelController {
  private view: WebContentsView | null = null;
  private window: BrowserWindow | null = null;
  private expanded = false;
  private config: PillPanelConfig | null = null;
  private pillState: PillState = "idle";
  private authInstalledPartitions = new Set<string>();

  /** True once the panel page has finished its initial load. */
  private viewReady = false;
  /** Events queued while the view is still loading; flushed on ready. */
  private pendingEvents: PillEvent[] = [];

  /** Original pill window dimensions before expansion. */
  private originalBounds: Electron.Rectangle | null = null;

  constructor(
    private readonly preloadPath: string,
    private readonly getServerBaseUrl: () => string,
    private readonly getServerToken: () => string,
    private readonly getCollapsedSize: () => { width: number; height: number },
  ) {}

  attachWindow(window: BrowserWindow): void {
    this.window = window;
    // Click-outside-to-close: when the expanded pill window loses focus, fold
    // the panel back. The pill itself is non-focusable when collapsed, so this
    // only fires while a panel is open.
    window.on("blur", () => {
      if (this.expanded) this.collapse();
    });
    window.on("closed", () => {
      this.destroy();
      this.window = null;
    });
  }

  configure(config: PillPanelConfig): void {
    const changed =
      this.config?.slug !== config.slug ||
      this.config?.panelId !== config.panelId;
    this.config = config;
    if (changed) {
      this.destroyView();
      // Warm the view now so it's loaded and listening before the first event.
      this.ensureView();
    }
  }

  isExpanded(): boolean {
    return this.expanded;
  }

  hasConfig(): boolean {
    return this.config !== null;
  }

  expand(): boolean {
    if (!this.window || !this.config || this.expanded) return false;

    const { expand } = this.config;
    const [wx, wy] = this.window.getPosition();
    const [ww, wh] = this.window.getSize();
    this.originalBounds = { x: wx, y: wy, width: ww, height: wh };

    const panelWidth = expand.width;
    const panelHeight = expand.height;
    const totalHeight = PILL_CHROME_HEIGHT + PANEL_GAP + panelHeight;
    const totalWidth = Math.max(ww, panelWidth);

    const workArea = screen.getDisplayMatching({
      x: wx,
      y: wy,
      width: ww,
      height: wh,
    }).workArea;

    let newX = wx;
    let newY = wy;

    const expandsDown =
      wy + wh + PANEL_GAP + panelHeight <= workArea.y + workArea.height;
    if (!expandsDown) newY = wy + wh - totalHeight;

    if (newX + totalWidth > workArea.x + workArea.width) {
      newX = workArea.x + workArea.width - totalWidth;
    }
    if (newX < workArea.x) newX = workArea.x;
    if (newY < workArea.y) newY = workArea.y;

    this.window.setSize(totalWidth, totalHeight);
    this.window.setPosition(Math.round(newX), Math.round(newY));
    this.window.setResizable(false);
    this.window.setFocusable(true);

    const view = this.ensureView();
    if (view) {
      const viewY = expandsDown ? PILL_CHROME_HEIGHT + PANEL_GAP : 0;
      view.setBounds({
        x: 0,
        y: viewY,
        width: panelWidth,
        height: panelHeight,
      });
      this.window.contentView.addChildView(view);
    }

    this.expanded = true;
    this.window.focus();
    log.info(`pill panel expanded: ${this.config.slug}`);
    return true;
  }

  collapse(): boolean {
    if (!this.window || !this.expanded) return false;

    if (this.view) this.window.contentView.removeChildView(this.view);

    const orig = this.originalBounds;
    if (orig) {
      this.window.setPosition(orig.x, orig.y);
      this.window.setSize(orig.width, orig.height);
    } else {
      const collapsed = this.getCollapsedSize();
      this.window.setSize(collapsed.width, collapsed.height);
    }

    this.window.setFocusable(false);
    this.expanded = false;
    this.originalBounds = null;
    log.info("pill panel collapsed");
    return true;
  }

  setPillState(state: PillState): void {
    this.pillState = state;
    this.sendEvent({ type: "stateChanged", state });
  }

  getPillState(): PillState {
    return this.pillState;
  }

  sendTranscript(text: string): void {
    this.sendEvent({ type: "transcriptReady", text });
  }

  private sendEvent(event: PillEvent): void {
    // Buffer until the page has loaded — a `transcriptReady` fired the instant
    // a dictation is consumed would otherwise race the view's first paint.
    if (!this.viewReady) {
      this.pendingEvents.push(event);
      this.ensureView();
      return;
    }
    if (!this.view || this.view.webContents.isDestroyed()) return;
    this.view.webContents.send("pill-panel:event", event);
  }

  /** Create (once) and return the panel view, or null when no config/window. */
  private ensureView(): WebContentsView | null {
    if (this.view) return this.view;
    if (!this.window || !this.config) return null;

    const { slug, entry } = this.config;
    const partition = `persist:pill-plugin-${slug}`;
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
    // Paint a dark background immediately so there's no white flash on the
    // transparent pill window before the plugin page's stylesheet loads.
    view.setBackgroundColor("#09090b");
    view.webContents.once("did-finish-load", () => {
      this.viewReady = true;
      for (const event of this.pendingEvents) {
        view.webContents.send("pill-panel:event", event);
      }
      this.pendingEvents = [];
    });

    const url = `${this.getServerBaseUrl()}/api/plugins/${encodeURIComponent(slug)}/ui/${entry.replace(/^\/+/, "")}`;
    void view.webContents.loadURL(url).catch(() => {});
    this.view = view;
    return view;
  }

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

  private isServerOrigin(url: string): boolean {
    try {
      return new URL(url).origin === new URL(this.getServerBaseUrl()).origin;
    } catch {
      return false;
    }
  }

  getWindow(): BrowserWindow | null {
    return this.window;
  }

  private destroyView(): void {
    if (!this.view) return;
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.contentView.removeChildView(this.view);
      } catch {}
    }
    this.view.webContents.close();
    this.view = null;
    this.viewReady = false;
    this.pendingEvents = [];
  }

  destroy(): void {
    if (this.expanded) this.collapse();
    this.destroyView();
    this.authInstalledPartitions.clear();
  }
}

let controller: PillPanelController | null = null;
let ipcRegistered = false;

export interface PillPanelHostDeps {
  window: BrowserWindow;
  getServerBaseUrl: () => string;
  getServerToken: () => string;
  getCollapsedSize: () => { width: number; height: number };
}

export function initPillPanelHost(deps: PillPanelHostDeps): void {
  const preloadPath = path.join(__dirname, "../preload/plugin-bridge.js");

  if (!controller) {
    controller = new PillPanelController(
      preloadPath,
      deps.getServerBaseUrl,
      deps.getServerToken,
      deps.getCollapsedSize,
    );
  }
  controller.attachWindow(deps.window);

  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle("pill-panel:expand", () => controller?.expand() ?? false);
  ipcMain.handle("pill-panel:collapse", () => controller?.collapse() ?? false);
  ipcMain.handle(
    "pill-panel:state",
    () => controller?.getPillState() ?? "idle",
  );

  ipcMain.handle(
    "pill-panel:configure",
    (
      _e,
      slug: string,
      panelId: string,
      entry: string,
      expand: { width: number; height: number },
    ) => {
      controller?.configure({ slug, panelId, entry, expand });
    },
  );
}

/**
 * Try to handle a pill-scoped host action. Returns `true` if the action was
 * handled, `false` if it should be passed to the default handler.
 */
export function handlePillAction<C extends keyof HostActions>(
  channel: C,
  payload: HostActions[C],
): boolean {
  if (channel === "pill:expand") {
    controller?.expand();
    return true;
  }
  if (channel === "pill:collapse") {
    controller?.collapse();
    return true;
  }
  if (channel === "pill:set-badge") {
    const badge = payload as HostActions["pill:set-badge"];
    controller?.getWindow()?.webContents.send("pill:set-badge", badge.text);
    return true;
  }
  return false;
}

export function getPillPanelController(): PillPanelController | null {
  return controller;
}

export function destroyPillPanel(): void {
  controller?.destroy();
}
