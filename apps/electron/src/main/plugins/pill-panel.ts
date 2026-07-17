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
  tokens?: Record<string, string>;
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

  /** Ignore blur-to-close until this timestamp (settle window after expand). */
  private blurGuardUntil = 0;
  /** When true, blur never collapses (e.g. while dictating a follow-up). */
  private suppressBlurClose = false;

  /** Grace period (ms) after expanding during which blur won't collapse. */
  private static readonly BLUR_SETTLE_MS = 750;

  constructor(
    private readonly preloadPath: string,
    private readonly getServerBaseUrl: () => string,
    private readonly getServerToken: () => string,
    private readonly getCollapsedSize: () => { width: number; height: number },
  ) {}

  attachWindow(window: BrowserWindow): void {
    this.window = window;
    // Click-outside-to-close: when the expanded pill window loses focus, fold
    // the panel back. Guarded two ways because the pill is a frameless,
    // always-on-top, normally-non-focusable panel: focusing it on expand (and
    // the mic/hotkey activity around a dictation) emits transient `blur` events
    // that would otherwise collapse the panel the instant it opens.
    //   1. `blurGuardUntil` ignores blur during a short settle window after
    //      expanding.
    //   2. `suppressBlurClose` ignores blur while the user is dictating a
    //      follow-up (the pill renderer toggles it around recording).
    window.on("blur", () => {
      if (!this.expanded) return;
      if (Date.now() < this.blurGuardUntil) return;
      if (this.suppressBlurClose) return;
      this.collapse();
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
    // Focusing the pill (needed so the panel's text input works) emits a
    // transient blur on this always-on-top panel; guard the settle window so
    // that self-inflicted blur doesn't immediately collapse what we just opened.
    this.blurGuardUntil = Date.now() + PillPanelController.BLUR_SETTLE_MS;
    this.window.focus();
    log.info(`pill panel expanded: ${this.config.slug}`);
    return true;
  }

  /**
   * Suppress (or re-enable) blur-to-close. The pill renderer calls this around
   * a follow-up dictation: starting the mic can pull OS focus away from the
   * pill, which would otherwise collapse the panel mid-conversation.
   */
  setSuppressBlurClose(suppress: boolean): void {
    this.suppressBlurClose = suppress;
    // Re-arm the settle guard when unsuppressing so the focus handoff back to
    // the pill after recording doesn't trip an immediate collapse.
    if (!suppress) {
      this.blurGuardUntil = Date.now() + PillPanelController.BLUR_SETTLE_MS;
    }
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
    // Tell the pill renderer the panel is no longer open so its state machine
    // stops treating hotkey presses as agent follow-ups.
    this.window.webContents.send("pill-panel:collapsed");
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

  /** Theme tokens for the panel page's preload to apply (matches the app). */
  getTokens(): { tokens?: Record<string, string> } {
    return this.config?.tokens ? { tokens: this.config.tokens } : {};
  }

  /** The panel view's webContents id, so the shared config IPC can route to it. */
  getViewWebContentsId(): number | null {
    return this.view && !this.view.webContents.isDestroyed()
      ? this.view.webContents.id
      : null;
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
      tokens?: Record<string, string>,
    ) => {
      controller?.configure({ slug, panelId, entry, expand, tokens });
    },
  );

  ipcMain.on("pill-panel:suppress-blur-close", (_e, suppress: boolean) => {
    controller?.setSuppressBlurClose(suppress);
  });
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
