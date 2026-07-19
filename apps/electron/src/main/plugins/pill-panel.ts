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

/** The pill bar's actual rendered CSS height (px). */
const PILL_BAR_HEIGHT = 43;
/** Margin between the pill bar and the screen edge (px). */
const PILL_EDGE_MARGIN = 8;
/**
 * Height reserved for the pill bar + screen-edge margin when expanded.
 * The panel view starts directly adjacent to the pill bar with zero gap.
 */
const EXPANDED_CHROME_HEIGHT = PILL_BAR_HEIGHT + PILL_EDGE_MARGIN;

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
 * The view is created lazily — on the first {@link expand} or the first buffered
 * event — rather than at {@link configure} time, so a plugin's HTML/CSS isn't
 * loaded at app startup before the panel is ever needed. Events emitted before
 * the page finishes loading are buffered (and trigger view creation) then
 * flushed on load, so a `transcriptReady` fired the instant a dictation is
 * consumed is never dropped.
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
    private readonly markProgrammaticMove?: (x: number, y: number) => void,
  ) {}

  attachWindow(window: BrowserWindow): void {
    this.window = window;
    // When the agent panel is expanded, never auto-collapse on blur.
    // The user closes the panel explicitly via the X button or hidePill.
    // This prevents the panel from vanishing mid-conversation when the
    // user clicks outside, Cmd+Tabs, or anything else steals focus.
    window.on("blur", () => {
      if (this.expanded) return;
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
      // Tear down any stale view but DON'T warm a new one — creating the view
      // (and loadURL'ing the plugin's HTML/CSS) is deferred until the panel is
      // first needed. The view is created lazily on the first `expand()` or the
      // first buffered event (see sendEvent), which still guarantees no event
      // is dropped while avoiding loading every plugin's UI at app startup.
      this.destroyView();
    }
  }

  isExpanded(): boolean {
    return this.expanded;
  }

  hasConfig(): boolean {
    return this.config !== null;
  }

  expand(
    pillSide?: "center" | "right",
  ): { expanded: true; direction: "up" | "down" } | false {
    if (!this.window || !this.config || this.expanded) return false;

    const { expand } = this.config;
    const [wx, wy] = this.window.getPosition();
    const [ww, wh] = this.window.getSize();
    this.originalBounds = { x: wx, y: wy, width: ww, height: wh };

    const panelWidth = expand.width;
    const panelHeight = expand.height;
    const totalHeight = EXPANDED_CHROME_HEIGHT + panelHeight;
    const totalWidth = Math.max(ww, panelWidth);

    const workArea = screen.getDisplayMatching({
      x: wx,
      y: wy,
      width: ww,
      height: wh,
    }).workArea;

    // Compensate X so the pill bar stays at the same screen position.
    let newX = wx;
    const widthGrowth = totalWidth - ww;
    if (widthGrowth > 0) {
      if (pillSide === "right") {
        newX -= widthGrowth;
      } else {
        newX -= Math.round(widthGrowth / 2);
      }
    }

    // Compensate Y: the expanded window uses a smaller chrome height
    // (EXPANDED_CHROME_HEIGHT vs the original wh).  Shift the window so
    // the pill bar's bottom edge stays at the same screen Y.
    let newY = wy + wh - EXPANDED_CHROME_HEIGHT;

    const expandsDown = newY + totalHeight <= workArea.y + workArea.height;
    if (!expandsDown) newY = wy + wh - totalHeight;

    if (newX + totalWidth > workArea.x + workArea.width) {
      newX = workArea.x + workArea.width - totalWidth;
    }
    if (newX < workArea.x) newX = workArea.x;
    if (newY < workArea.y) newY = workArea.y;

    // Mark the target as programmatic so the pill's move listener (which
    // detects user drags and latches pillPosition to "custom") ignores the
    // position change from the expand.
    const px = Math.round(newX);
    const py = Math.round(newY);
    this.markProgrammaticMove?.(px, py);
    this.window.setSize(totalWidth, totalHeight);
    this.window.setPosition(px, py);
    this.window.setResizable(false);
    this.window.setFocusable(true);

    const view = this.ensureView();
    if (view) {
      const viewY = expandsDown ? EXPANDED_CHROME_HEIGHT : 0;
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
    // The BrowserWindow focus goes to the pill's own webContents (pill.html).
    // The panel lives in a child WebContentsView with a *separate* webContents.
    // Without this, macOS (especially with `type: "panel"`) won't route
    // wheel/scroll events to the panel — the view's NSView is not the first
    // responder.  Focusing the view's webContents makes it the input target so
    // scrolling, text selection, and keyboard events work inside the panel.
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.focus();
    }
    const direction = expandsDown ? "down" : "up";
    // Tell the panel its position relative to the pill bar so it can
    // flip its border-radius (rounded top when above, rounded bottom
    // when below the pill bar).
    this.sendEvent({
      type: "directionChanged",
      direction,
    } as unknown as PillEvent);
    log.info(`pill panel expanded ${direction}: ${this.config.slug}`);
    return { expanded: true, direction } as const;
  }

  collapse(): boolean {
    if (!this.window || !this.expanded) return false;

    if (this.view) this.window.contentView.removeChildView(this.view);

    const orig = this.originalBounds;
    if (orig) {
      // Mark as programmatic so the move listener doesn't latch to "custom".
      this.markProgrammaticMove?.(orig.x, orig.y);
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

  /** Forward a live plugin stream event (agent delta/start/end) to the panel. */
  sendStreamEvent(event: PillEvent): void {
    this.sendEvent(event);
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
    // Transparent background so the rounded corners (setBorderRadius) show
    // through to the desktop, matching the panel's CSS border-radius.  The
    // panel's own .panel div paints an opaque background, so there's no flash.
    view.setBackgroundColor("#00000000");
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
  /** Mark a position as programmatic so the pill's move listener ignores it. */
  markProgrammaticMove?: (x: number, y: number) => void;
}

export function initPillPanelHost(deps: PillPanelHostDeps): void {
  const preloadPath = path.join(__dirname, "../preload/plugin-bridge.js");

  if (!controller) {
    controller = new PillPanelController(
      preloadPath,
      deps.getServerBaseUrl,
      deps.getServerToken,
      deps.getCollapsedSize,
      deps.markProgrammaticMove,
    );
  }
  controller.attachWindow(deps.window);

  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle(
    "pill-panel:expand",
    (_e, pillSide?: "center" | "right") =>
      controller?.expand(pillSide) ?? false,
  );
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
    controller?.expand(); // No pillSide hint from host action; defaults to center
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
