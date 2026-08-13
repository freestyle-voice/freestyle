import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { BrowserWindow, screen, systemPreferences } from "electron";
import type { SpriteTravelKind } from "../shared/sprite-events";
import {
  SPRITE_IMPACT_CEILING_MS,
  SPRITE_IMPACT_TRAVEL_CEILING_MS,
  SPRITE_PERFORM_TIMEOUT_MS,
  SPRITE_TRAVEL_MAX_MS,
} from "../shared/sprites";
import { getNativeBinaryPath } from "./native-binary";

/**
 * Sprite travel: physically flying the companion window to where an OS
 * action will land, performing there, and returning home. Ported from the
 * samurai-jeb branch's main/jeb.ts, reshaped around the shared companion
 * window and the sprite event bus.
 *
 * The sync contract: performSyncAction resolves at the performance's impact
 * frame (or a hard ceiling), so the caller can fire the paste exactly on
 * the sword swing without ever stalling on a wedged renderer.
 */

interface TravelHost {
  getWindow: () => BrowserWindow | null;
  windowSize: () => number;
  homePosition: () => { x: number; y: number };
  /** Sheet sprite on screen — someone is listening for perform-sync. */
  theaterAvailable: () => boolean;
  travelEnabled: () => boolean;
  sendEvent: (ev: unknown) => void;
}

let host: TravelHost | null = null;
let travelTimer: NodeJS.Timeout | null = null;
let cursorTimer: NodeJS.Timeout | null = null;
let syncBusy = false;

const impactWaiters = new Map<string, () => void>();
const doneWaiters = new Map<string, () => void>();

export function resolveSpriteImpact(nonce: string): void {
  impactWaiters.get(nonce)?.();
}

export function resolveSpritePerformDone(nonce: string): void {
  doneWaiters.get(nonce)?.();
}

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

function execOut(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { encoding: "utf-8", timeout: timeoutMs },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      },
    );
  });
}

function prefersReducedMotion(): boolean {
  try {
    return systemPreferences.getAnimationSettings().prefersReducedMotion;
  } catch {
    return false;
  }
}

function stopTravel(): void {
  if (travelTimer) {
    clearInterval(travelTimer);
    travelTimer = null;
  }
}

/**
 * Move the window to (x, y) over a capped duration. Distance changes speed,
 * not duration, so travel never meaningfully delays the OS action behind it.
 */
function travelTo(x: number, y: number, kind: SpriteTravelKind): Promise<void> {
  return new Promise((resolve) => {
    const h = host;
    const win = h?.getWindow();
    if (!h || !win || win.isDestroyed() || !win.isVisible()) {
      resolve();
      return;
    }
    stopTravel();
    const size = h.windowSize();
    const from = win.getBounds();
    const dx = x - from.x;
    const dy = y - from.y;
    if (dx === 0 && dy === 0) {
      resolve();
      return;
    }
    const direction = dx < 0 ? "left" : "right";
    if (prefersReducedMotion()) {
      win.setBounds({ x, y, width: size, height: size });
      resolve();
      return;
    }
    h.sendEvent({
      kind: "travel",
      phase: "start",
      travelKind: kind,
      direction,
    });
    const duration = Math.min(
      SPRITE_TRAVEL_MAX_MS,
      Math.max(220, Math.hypot(dx, dy) * 0.6),
    );
    const start = Date.now();
    travelTimer = setInterval(() => {
      const w = host?.getWindow();
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
        width: size,
        height: size,
      });
      if (t >= 1) {
        stopTravel();
        host?.sendEvent({
          kind: "travel",
          phase: "end",
          travelKind: kind,
          direction,
        });
        resolve();
      }
    }, 33);
  });
}

function clampToWorkArea(x: number, y: number): { x: number; y: number } {
  const size = host?.windowSize() ?? 256;
  const display = screen.getDisplayNearestPoint({
    x: x + size / 2,
    y: y + size / 2,
  });
  const wa = display.workArea;
  return {
    x: Math.min(Math.max(x, wa.x), wa.x + wa.width - size),
    y: Math.min(Math.max(y, wa.y), wa.y + wa.height - size),
  };
}

/**
 * True when a screen point sits under one of our own OVERLAY windows (the
 * panel, above all). Focus- and pid-based guards both have blind spots — a
 * non-activating panel's key focus is invisible to getFocusedWindow(), and
 * Chromium hosts web-content AX elements in renderer helpers. Geometry
 * doesn't lie: the sprite never performs on top of Freestyle's own UI.
 */
function pointInOwnWindow(x: number, y: number): boolean {
  const self = host?.getWindow();
  return BrowserWindow.getAllWindows().some((w) => {
    if (w.isDestroyed() || !w.isVisible()) return false;
    if (w === self) return false;
    if (!w.isAlwaysOnTop()) return false;
    const b = w.getBounds();
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
  });
}

/**
 * Rolling sample of the last cursor position seen OUTSIDE Freestyle's own
 * windows. While the agent works the mouse is usually parked on the panel
 * watching the stream — useless as a target — but moments earlier it was in
 * the user's document, on the field they clicked into. That remembered
 * point is the best universal stand-in for the text caret.
 */
let lastExternalCursor: { x: number; y: number; at: number } | null = null;
const EXTERNAL_CURSOR_MAX_AGE_MS = 2 * 60 * 1000;

async function getCaretBounds(): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  if (process.platform !== "darwin") return null;
  // While the user types in our non-activating panel, the systemwide AX
  // focused element is OUR text field — its caret would send the sprite to
  // the chat instead of the user's document.
  if (BrowserWindow.getFocusedWindow()) return null;
  const binary = getNativeBinaryPath("macos-ax");
  if (!binary) return null;
  try {
    // Kept tight: this sits on the paste trip's critical path — a slow AX
    // answer should fall back to the cursor, not stall the swing.
    const out = await execOut(binary, ["bounds", String(process.pid)], 800);
    const rect = JSON.parse(out) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    if (rect.width < 0 || rect.height < 0) return null;
    return rect;
  } catch {
    return null;
  }
}

async function getFocusedWindowBounds(): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  if (process.platform !== "darwin") return null;
  try {
    const out = await execOut(
      "osascript",
      [
        "-e",
        'tell application "System Events" to tell (first application process whose frontmost is true) to get {position, size} of front window',
      ],
      1500,
    );
    const nums = out
      .split(",")
      .map((n) => Number.parseInt(n.trim(), 10))
      .filter((n) => Number.isFinite(n));
    if (nums.length < 4) return null;
    const [x, y, width, height] = nums;
    if (width <= 0 || height <= 0) return null;
    return { x, y, width, height };
  } catch {
    return null;
  }
}

/**
 * Where the performance lands: the AX caret when an app can answer, else
 * the pointer (the user clicked the field they're editing), else the last
 * cursor position seen outside our own windows, else the focused window's
 * bottom edge. First candidate not covered by Freestyle's own UI wins. The
 * returned point is where the sprite's feet land.
 */
async function resolveStagePoint(): Promise<{ x: number; y: number } | null> {
  const [caret, focused] = await Promise.all([
    getCaretBounds(),
    getFocusedWindowBounds(),
  ]);
  const cursor = screen.getCursorScreenPoint();
  const candidates: Array<{ x: number; y: number }> = [];
  // Some apps answer the caret query with an all-zero rect; that's "no
  // caret", not "top-left corner of the primary display".
  if (
    caret &&
    (caret.x !== 0 || caret.y !== 0 || caret.width > 0 || caret.height > 0)
  ) {
    candidates.push({ x: caret.x, y: caret.y + caret.height + 8 });
  }
  // Feet land just under the pointer so the slash crosses it.
  candidates.push({ x: cursor.x, y: cursor.y + 48 });
  if (
    lastExternalCursor &&
    Date.now() - lastExternalCursor.at < EXTERNAL_CURSOR_MAX_AGE_MS
  ) {
    candidates.push({
      x: lastExternalCursor.x,
      y: lastExternalCursor.y + 48,
    });
  }
  if (focused) {
    for (const frac of [0.5, 0.75]) {
      candidates.push({
        x: focused.x + Math.round(focused.width * frac),
        y: focused.y + focused.height,
      });
    }
  }
  for (const point of candidates) {
    if (!pointInOwnWindow(point.x, point.y)) return point;
  }
  return null;
}

export function initSpriteTravel(travelHost: TravelHost): void {
  host = travelHost;
  cursorTimer = setInterval(() => {
    const c = screen.getCursorScreenPoint();
    if (!pointInOwnWindow(c.x, c.y)) {
      lastExternalCursor = { x: c.x, y: c.y, at: Date.now() };
    }
  }, 1_500);
}

export function destroySpriteTravel(): void {
  stopTravel();
  if (cursorTimer) clearInterval(cursorTimer);
  cursorTimer = null;
  host = null;
}

/**
 * The sync lane: travel to the target (if this sprite travels), tell the
 * companion to play the tool's performance, and resolve at the impact
 * frame or the ceiling — the caller fires its OS action on resolve. The
 * return trip runs after the performance finishes, off the critical path.
 */
export async function performSyncAction(payload: {
  name: string;
  toolClass: string;
}): Promise<boolean> {
  const h = host;
  const win = h?.getWindow();
  if (
    !h ||
    !win ||
    win.isDestroyed() ||
    !win.isVisible() ||
    !h.theaterAvailable()
  ) {
    return false;
  }

  const nonce = randomUUID();
  // Concurrent syncs (rapid pastes): the second performs in place — two
  // simultaneous flights would fight over the window.
  const travel = h.travelEnabled() && !syncBusy && !prefersReducedMotion();
  const ceiling = travel
    ? SPRITE_IMPACT_TRAVEL_CEILING_MS
    : SPRITE_IMPACT_CEILING_MS;
  const impact = waitForSignal(impactWaiters, nonce, ceiling);
  const done = waitForSignal(doneWaiters, nonce, SPRITE_PERFORM_TIMEOUT_MS);

  let travelled = false;
  if (travel) {
    syncBusy = true;
    const stage = await resolveStagePoint();
    if (stage) {
      const size = h.windowSize();
      const pos = clampToWorkArea(
        Math.round(stage.x - size / 2),
        Math.round(stage.y - size),
      );
      await travelTo(pos.x, pos.y, "run");
      travelled = true;
    }
  }

  h.sendEvent({
    kind: "perform-sync",
    name: payload.name,
    toolClass: payload.toolClass,
    nonce,
  });
  await impact;

  void done.then(async () => {
    if (travelled) {
      const home = h.homePosition();
      await travelTo(home.x, home.y, "run");
    }
    if (travel) syncBusy = false;
  });

  return true;
}
