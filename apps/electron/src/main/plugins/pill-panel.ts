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

/** The pill chrome height (px) — the WebContentsView sits below it. */
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
 * Only one pill panel plugin is active at a time (single-owner model).
 */
export class PillPanelController {
  private view: WebContentsView | null = null;
  private window: BrowserWindow | null = null;
  private expanded = false;
  private config: PillPanelConfig | null = null;
  private pillState: PillState = "idle";
  private authInstalledPartitions = new Set<string>();

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
    window.on("closed", () => {
      this.destroy();
      this.window = null;
    });
  }

  configure(config: PillPanelConfig): void {
    if (
      this.config?.slug !== config.slug ||
      this.config?.panelId !== config.panelId
    ) {
      this.destroy();
    }
    this.config = config;
  }

  isExpanded(): boolean {
    return this.expanded;
  }

  hasConfig(): boolean {
    return this.config !== null;
  }

  expand(): boolean {
    if (!this.window || !this.config || this.expanded) return false;

    const { expand, slug, entry } = this.config;
    const [wx, wy] = this.window.getPosition();
    const [ww, wh] = this.window.getSize();
    this.originalBounds = { x: wx, y: wy, width: ww, height: wh };

    const panelWidth = expand.width;
    const panelHeight = expand.height;
    const totalHeight = PILL_CHROME_HEIGHT + PANEL_GAP + panelHeight;
    const totalWidth = Math.max(ww, panelWidth);

    const display = screen.getDisplayMatching({
      x: wx,
      y: wy,
      width: ww,
      height: wh,
    });
    const workArea = display.workArea;

    let newX = wx;
    let newY = wy;

    const pillBottom = wy + wh;
    const expandsDown =
      pillBottom + PANEL_GAP + panelHeight <= workArea.y + workArea.height;

    if (expandsDown) {
      newY = wy;
    } else {
      newY = wy + wh - totalHeight;
    }

    if (newX + totalWidth > workArea.x + workArea.width) {
      newX = workArea.x + workArea.width - totalWidth;
    }
    if (newX < workArea.x) newX = workArea.x;
    if (newY < workArea.y) newY = workArea.y;

    this.window.setSize(totalWidth, totalHeight);
    this.window.setPosition(Math.round(newX), Math.round(newY));
    this.window.setResizable(false);
    this.window.setFocusable(true);

    if (!this.view) {
      this.createView(slug, entry);
    }

    if (this.view) {
      const viewY = expandsDown ? PILL_CHROME_HEIGHT + PANEL_GAP : 0;
      this.view.setBounds({
        x: 0,
        y: viewY,
        width: panelWidth,
        height: panelHeight,
      });
      this.window.contentView.addChildView(this.view);
    }

    this.expanded = true;
    this.window.focus();
    log.info(`pill panel expanded: ${slug}`);
    return true;
  }

  collapse(): boolean {
    if (!this.window || !this.expanded) return false;

    if (this.view) {
      this.window.contentView.removeChildView(this.view);
    }

    const collapsed = this.getCollapsedSize();
    const orig = this.originalBounds;

    if (orig) {
      this.window.setPosition(orig.x, orig.y);
      this.window.setSize(orig.width, orig.height);
    } else {
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

  requestPanel(): void {
    this.sendEvent({ type: "panelRequested" });
  }

  private sendEvent(event: PillEvent): void {
    if (!this.view || this.view.webContents.isDestroyed()) return;
    this.view.webContents.send("pill-panel:event", event);
  }

  private createView(slug: string, entry: string): void {
    const partition = `persist:pill-plugin-${slug}`;
    this.installServerAuth(partition);

    this.view = new WebContentsView({
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
    this.view.setBackgroundColor("#09090b");

    const url = `${this.getServerBaseUrl()}/api/plugins/${encodeURIComponent(slug)}/ui/${entry.replace(/^\/+/, "")}`;
    void this.view.webContents.loadURL(url).catch(() => {});
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

  destroy(): void {
    if (this.expanded) this.collapse();
    if (this.view) {
      if (this.window && !this.window.isDestroyed()) {
        try {
          this.window.contentView.removeChildView(this.view);
        } catch {}
      }
      this.view.webContents.close();
      this.view = null;
    }
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
