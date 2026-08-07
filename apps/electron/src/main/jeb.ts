import { join } from "node:path";
import { is } from "@electron-toolkit/utils";
import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  systemPreferences,
} from "electron";
import {
  JEB_IMPACT_CEILING_MS,
  JEB_IMPACT_TRAVEL_CEILING_MS,
  JEB_TRAVEL_MAX_MS,
  JEB_WINDOW_SIZE,
  type JebScript,
  type JebTravelKind,
} from "../shared/jeb";

/**
 * Samurai Jeb's main-process half: the overlay window, click-through, travel
 * (the window itself is what moves across the screen — the renderer only ever
 * draws a sprite centered in it), and the impact contract that lets a paste
 * land exactly on a sword swing.
 *
 * The window recipe and hot-rect click-through mirror the pill's; see
 * createAppWindow() and setPillHotRect() in index.ts for the rationale on
 * panel type, screen-saver level, and backgroundThrottling.
 */

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface JebHost {
  openChat: () => void;
  getFocusedWindowBounds: () => Promise<Rect | null>;
  getCaretBounds: () => Promise<Rect | null>;
  isHeldForOnboarding: () => boolean;
}

/** Targeting decisions, visible in the dev terminal: which stage-point
 *  candidate won and which were rejected as Freestyle UI. */
function jebDebug(message: string): void {
  if (!app.isPackaged) console.log(`[jeb] ${message}`);
}

let host: JebHost | null = null;
let jebWindow: BrowserWindow | null = null;
let jebEnabled = true;
let jebInitialized = false;

// The character occupies a small region of the 256px window (measured from
// the idle frames' alpha at 2x): left edge ~100px in, feet ~38px above the
// window bottom. Snugging him into the corner means hanging the window off
// the work area so the *body*, not the transparent margin, touches the edge.
const JEB_SPRITE_LEFT_PX = 100;
const JEB_SPRITE_BOTTOM_GAP_PX = 38;
const JEB_CORNER_MARGIN = 4;
const JEB_FOLLOW_MS = 3_000;
const JEB_PERFORM_TIMEOUT_MS = 15_000;

function jebHomePosition(display?: Electron.Display): { x: number; y: number } {
  const d =
    display ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wa = d.workArea;
  return {
    x: wa.x + JEB_CORNER_MARGIN - JEB_SPRITE_LEFT_PX,
    y:
      wa.y +
      wa.height -
      JEB_WINDOW_SIZE +
      JEB_SPRITE_BOTTOM_GAP_PX -
      JEB_CORNER_MARGIN,
  };
}

function getJebURL(): string {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/jeb.html`;
  }
  return "app://renderer/jeb.html";
}

// --- Hot-rect click-through (per-window copy of the pill's system) ---------

let jebHotRect: Rect | null = null;
let jebHotPollTimer: NodeJS.Timeout | null = null;

function stopJebHotPoll(): void {
  if (jebHotPollTimer) {
    clearInterval(jebHotPollTimer);
    jebHotPollTimer = null;
  }
}

function setJebHotRect(rect: Rect | null): void {
  if (process.env.FREESTYLE_E2E === "1") return;
  jebHotRect = rect;
  const win = jebWindow;
  if (!win || win.isDestroyed()) return;
  if (!rect) {
    stopJebHotPoll();
    win.setIgnoreMouseEvents(false);
    return;
  }
  win.setIgnoreMouseEvents(true, { forward: process.platform !== "linux" });
  if (jebHotPollTimer) return;
  jebHotPollTimer = setInterval(() => {
    const w = jebWindow;
    const hot = jebHotRect;
    if (!w || w.isDestroyed() || !hot || !w.isVisible()) return;
    const bounds = w.getBounds();
    const cursor = screen.getCursorScreenPoint();
    const inside =
      cursor.x >= bounds.x + hot.x &&
      cursor.x <= bounds.x + hot.x + hot.width &&
      cursor.y >= bounds.y + hot.y &&
      cursor.y <= bounds.y + hot.y + hot.height;
    if (!inside) return;
    jebHotRect = null;
    stopJebHotPoll();
    w.setIgnoreMouseEvents(false);
    w.webContents.send("jeb:hot-enter");
  }, 120);
}

// --- Travel ----------------------------------------------------------------

let travelTimer: NodeJS.Timeout | null = null;
let homeDisplayId: number | null = null;
let followTimer: NodeJS.Timeout | null = null;
/** Non-null while a script is running; new scripts preempt the current one. */
let activeScriptId: string | null = null;

function stopTravel(): void {
  if (travelTimer) {
    clearInterval(travelTimer);
    travelTimer = null;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return systemPreferences.getAnimationSettings().prefersReducedMotion;
  } catch {
    return false;
  }
}

function sendToJeb(channel: string, payload?: unknown): void {
  const win = jebWindow;
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

/**
 * Move the window to (x, y) over a capped duration. Distance changes speed,
 * not duration, so travel never meaningfully delays the OS action behind it.
 */
function travelTo(x: number, y: number, kind: JebTravelKind): Promise<void> {
  return new Promise((resolve) => {
    const win = jebWindow;
    if (!win || win.isDestroyed() || !win.isVisible()) {
      resolve();
      return;
    }
    stopTravel();
    const from = win.getBounds();
    const dx = x - from.x;
    const dy = y - from.y;
    if (dx === 0 && dy === 0) {
      resolve();
      return;
    }
    const direction = dx < 0 ? "left" : "right";
    if (prefersReducedMotion()) {
      win.setBounds({ x, y, width: JEB_WINDOW_SIZE, height: JEB_WINDOW_SIZE });
      resolve();
      return;
    }
    sendToJeb("jeb:travel", { phase: "start", kind, direction });
    const duration = Math.min(
      JEB_TRAVEL_MAX_MS,
      Math.max(220, Math.hypot(dx, dy) * 0.6),
    );
    const start = Date.now();
    travelTimer = setInterval(() => {
      const w = jebWindow;
      if (!w || w.isDestroyed()) {
        stopTravel();
        resolve();
        return;
      }
      const t = Math.min(1, (Date.now() - start) / duration);
      // Jump arcs lift the window; ground travel eases in-out.
      const ease = t * (2 - t);
      const arc = kind === "jump" ? Math.sin(t * Math.PI) * 90 : 0;
      w.setBounds({
        x: Math.round(from.x + dx * ease),
        y: Math.round(from.y + dy * ease - arc),
        width: JEB_WINDOW_SIZE,
        height: JEB_WINDOW_SIZE,
      });
      if (t >= 1) {
        stopTravel();
        sendToJeb("jeb:travel", { phase: "end", kind, direction });
        resolve();
      }
    }, 33);
  });
}

function clampToWorkArea(x: number, y: number): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({
    x: x + JEB_WINDOW_SIZE / 2,
    y: y + JEB_WINDOW_SIZE / 2,
  });
  const wa = display.workArea;
  return {
    x: Math.min(Math.max(x, wa.x), wa.x + wa.width - JEB_WINDOW_SIZE),
    y: Math.min(Math.max(y, wa.y), wa.y + wa.height - JEB_WINDOW_SIZE),
  };
}

/**
 * True when a screen point sits under one of our own OVERLAY windows (the
 * chat pill above all). Focus- and pid-based guards both have blind spots —
 * a non-activating panel's key focus is invisible to getFocusedWindow(),
 * and Chromium hosts web-content AX elements in renderer helper processes,
 * so the caret probe can pass every ownership check and still be pointing
 * at our own composer. Geometry doesn't lie: Jeb never performs on top of
 * Freestyle's own UI.
 *
 * Only always-on-top windows count: the dashboard is a normal window that
 * routinely sits BEHIND the user's document — its rect covering a point
 * says nothing about what's actually visible there, and counting it made
 * every cursor over half the screen look like Freestyle UI.
 */
function pointInOwnWindow(x: number, y: number): boolean {
  return BrowserWindow.getAllWindows().some((w) => {
    if (w.isDestroyed() || !w.isVisible()) return false;
    if (w === jebWindow) return false;
    if (!w.isAlwaysOnTop()) return false;
    const b = w.getBounds();
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
  });
}

/**
 * Rolling sample of the last cursor position seen OUTSIDE Freestyle's own
 * windows. While the agent works, the mouse is usually parked on the chat
 * card watching the stream — useless as a target — but moments earlier it
 * was in the user's document, on the field they clicked into. That remembered
 * point is the best universal stand-in for the text caret.
 */
let lastExternalCursor: { x: number; y: number; at: number } | null = null;
const EXTERNAL_CURSOR_MAX_AGE_MS = 2 * 60 * 1000;

function trackExternalCursor(): void {
  const c = screen.getCursorScreenPoint();
  if (!pointInOwnWindow(c.x, c.y)) {
    lastExternalCursor = { x: c.x, y: c.y, at: Date.now() };
  }
}

/**
 * Where the script performs: the caret when AX can see one, else the focused
 * window's near-bottom edge, else stay put. The returned point is where the
 * sprite's feet should land; the window is placed around it. Candidates that
 * land inside Freestyle's own windows are rejected in order.
 */
async function resolveStagePoint(
  target: JebScript["travel"],
): Promise<{ x: number; y: number } | null> {
  if (!host) return null;
  if (target === "home") {
    const home = jebHomePosition();
    return { x: home.x + JEB_WINDOW_SIZE / 2, y: home.y + JEB_WINDOW_SIZE };
  }
  if (target === "screen-edge") {
    const wa = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    ).workArea;
    return { x: wa.x + 24, y: wa.y + wa.height };
  }
  // Candidates, most precise first. The AX caret is exact but most apps
  // (canvas editors, Chromium without AXManualAccessibility) can't answer;
  // the mouse pointer is the universal stand-in — the user clicked the text
  // field they're editing, so the pointer marks it in every app. Window
  // bottom-edge points are the last resort. First candidate not covered by
  // Freestyle's own UI wins.
  const [caret, focused] = await Promise.all([
    host.getCaretBounds(),
    host.getFocusedWindowBounds(),
  ]);
  const cursor = screen.getCursorScreenPoint();
  const candidates: Array<{ label: string; x: number; y: number }> = [];
  // Some apps answer the caret query with an all-zero rect; that's "no
  // caret", not "top-left corner of the primary display".
  if (
    caret &&
    (caret.x !== 0 || caret.y !== 0 || caret.width > 0 || caret.height > 0)
  ) {
    candidates.push({
      label: "ax-caret",
      x: caret.x,
      y: caret.y + caret.height + 8,
    });
  }
  // Feet land just under the pointer so the slash crosses it.
  candidates.push({ label: "cursor", x: cursor.x, y: cursor.y + 48 });
  if (
    lastExternalCursor &&
    Date.now() - lastExternalCursor.at < EXTERNAL_CURSOR_MAX_AGE_MS
  ) {
    candidates.push({
      label: "last-external-cursor",
      x: lastExternalCursor.x,
      y: lastExternalCursor.y + 48,
    });
  }
  if (focused) {
    for (const frac of [0.5, 0.75]) {
      candidates.push({
        label: `window-bottom-${frac}`,
        x: focused.x + Math.round(focused.width * frac),
        y: focused.y + focused.height,
      });
    }
  }
  for (const point of candidates) {
    if (!pointInOwnWindow(point.x, point.y)) {
      jebDebug(
        `stage: ${point.label} (${point.x}, ${point.y}); rejected: ${
          candidates
            .slice(0, candidates.indexOf(point))
            .map((c) => c.label)
            .join(", ") || "none"
        }`,
      );
      return point;
    }
  }
  jebDebug(
    `stage: none — all rejected: ${candidates.map((c) => c.label).join(", ")}`,
  );
  return null;
}

const impactWaiters = new Map<string, () => void>();
const doneWaiters = new Map<string, () => void>();

function waitForSignal(
  map: Map<string, () => void>,
  id: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      map.delete(id);
      resolve();
    }, timeoutMs);
    map.set(id, () => {
      clearTimeout(timer);
      map.delete(id);
      resolve();
    });
  });
}

async function runScript(script: JebScript): Promise<void> {
  const win = jebWindow;
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  activeScriptId = script.id;
  sendToJeb("jeb:wake");

  if (script.travel && script.travel !== "home") {
    const stage = await resolveStagePoint(script.travel);
    if (stage && activeScriptId === script.id) {
      const pos = clampToWorkArea(
        Math.round(stage.x - JEB_WINDOW_SIZE / 2),
        Math.round(stage.y - JEB_WINDOW_SIZE),
      );
      await travelTo(pos.x, pos.y, script.travelKind ?? "run");
    }
  }
  if (activeScriptId !== script.id) return;

  sendToJeb("jeb:perform", {
    id: script.id,
    steps: script.performance,
    say: script.say ?? null,
  });
  await waitForSignal(doneWaiters, script.id, JEB_PERFORM_TIMEOUT_MS);
  if (activeScriptId !== script.id) return;

  if (script.returnHome !== false) {
    const home = jebHomePosition(
      homeDisplayId != null
        ? screen.getAllDisplays().find((d) => d.id === homeDisplayId)
        : undefined,
    );
    await travelTo(home.x, home.y, "run");
  }
  if (activeScriptId === script.id) activeScriptId = null;
}

// --- Window lifecycle ------------------------------------------------------

function createJebWindow(): void {
  if (jebWindow) return;
  const home = jebHomePosition();
  const win = new BrowserWindow({
    width: JEB_WINDOW_SIZE,
    height: JEB_WINDOW_SIZE,
    x: home.x,
    y: home.y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    focusable: false,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      // Same transparent-overlay caveat as the pill window: occlusion
      // misdetection would freeze the sprite loop.
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.on("closed", () => {
    jebWindow = null;
    stopTravel();
    stopJebHotPoll();
  });
  void win.loadURL(getJebURL());
  jebWindow = win;
}

export function isJebEnabled(): boolean {
  return jebEnabled;
}

export function setJebEnabled(enabled: boolean): void {
  jebDebug(`setJebEnabled(${enabled})`);
  jebEnabled = enabled;
  updateJeb();
}

export function updateJeb(): void {
  if (!jebInitialized) return;
  const shouldShow = jebEnabled && !host?.isHeldForOnboarding();
  if (!shouldShow) {
    if (followTimer) {
      clearInterval(followTimer);
      followTimer = null;
    }
    stopTravel();
    activeScriptId = null;
    jebWindow?.hide();
    return;
  }
  if (!jebWindow) createJebWindow();
  const win = jebWindow;
  if (!win) return;
  const place = (): void => {
    const w = jebWindow;
    if (!w || w.isDestroyed()) return;
    const display = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    );
    const home = jebHomePosition(display);
    homeDisplayId = display.id;
    w.setBounds({
      x: home.x,
      y: home.y,
      width: JEB_WINDOW_SIZE,
      height: JEB_WINDOW_SIZE,
    });
    if (!w.isVisible()) w.showInactive();
  };
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", place);
  } else {
    place();
  }
  if (!followTimer) {
    followTimer = setInterval(() => {
      const w = jebWindow;
      if (!w || w.isDestroyed() || !w.isVisible()) return;
      // Only relocate while idle at home — never mid-performance.
      if (activeScriptId) return;
      const display = screen.getDisplayNearestPoint(
        screen.getCursorScreenPoint(),
      );
      if (display.id === homeDisplayId) return;
      const home = jebHomePosition(display);
      homeDisplayId = display.id;
      w.setBounds({
        x: home.x,
        y: home.y,
        width: JEB_WINDOW_SIZE,
        height: JEB_WINDOW_SIZE,
      });
    }, JEB_FOLLOW_MS);
  }
}

/** The remix hotkey (or anything else) woke the agent — wake the character. */
export function jebNotifyActivity(): void {
  sendToJeb("jeb:wake");
}

let greetSeq = 0;

/** The chat opened beside him — a small hop to attention. */
// A silent hop — "I'm listening…" is reserved for jebListening(), when the
// microphone is actually live. Saying it on a hover-open would be a lie.
export function jebGreet(): void {
  greetSeq += 1;
  void runScript({
    id: `jeb-greet-${greetSeq}`,
    performance: [{ state: "jump-start" }, { state: "defend", holdMs: 250 }],
    returnHome: false,
  });
}

/** Dictation replaces the pill capsule with Jeb holding a listening bubble. */
export function jebListening(on: boolean): void {
  if (!jebEnabled) return;
  sendToJeb("jeb:listen", on);
}

export function initJeb(hostImpl: JebHost): void {
  host = hostImpl;
  jebInitialized = true;

  // Remember where the mouse last was outside our own UI (see
  // lastExternalCursor). Cheap: one point + a handful of rect checks.
  setInterval(trackExternalCursor, 500);

  ipcMain.on("jeb:play", (_event, script: JebScript) => {
    if (!script || typeof script.id !== "string") return;
    void runScript(script);
  });

  // Deferred-action lane: resolves at the performance's impact frame or at
  // the ceiling, whichever comes first. The caller runs the OS action on
  // resolve — a wedged animation can never block real work. Scripts that
  // travel first (paste) get a ceiling wide enough for the whole trip.
  ipcMain.handle("jeb:play-sync", async (_event, script: JebScript) => {
    if (!script || typeof script.id !== "string") return false;
    const win = jebWindow;
    if (!win || win.isDestroyed() || !win.isVisible()) return false;
    const travels = !!script.travel && script.travel !== "home";
    const impact = waitForSignal(
      impactWaiters,
      script.id,
      travels ? JEB_IMPACT_TRAVEL_CEILING_MS : JEB_IMPACT_CEILING_MS,
    );
    void runScript(script);
    await impact;
    return true;
  });

  ipcMain.on("jeb:impact", (_event, id: string) => {
    impactWaiters.get(id)?.();
  });

  ipcMain.on("jeb:perform-done", (_event, id: string) => {
    doneWaiters.get(id)?.();
  });

  ipcMain.on("jeb:say", (_event, text: string) => {
    if (typeof text !== "string" || !text.trim()) return;
    sendToJeb("jeb:say", text.slice(0, 200));
  });

  ipcMain.on("jeb:thinking", (_event, on: boolean) => {
    sendToJeb("jeb:thinking", on === true);
  });

  ipcMain.on("jeb:set-hot-rect", (event, rect: Rect | null) => {
    if (event.sender !== jebWindow?.webContents) return;
    setJebHotRect(rect);
  });

  ipcMain.on("jeb:hover-open", (event) => {
    if (event.sender !== jebWindow?.webContents) return;
    host?.openChat();
  });

  updateJeb();
}
