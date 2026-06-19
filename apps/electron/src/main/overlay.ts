/**
 * Guidance overlay window — the "ghost cursor".
 *
 * A transparent, click-through, always-on-top window covering the primary
 * display. In guided computer-use mode the agent pushes {@link GuidanceEvent}s
 * here (move/click/type captions) and the renderer draws a ghost cursor,
 * highlight, and caption pointing the user to each step. It never receives
 * input — the real desktop underneath stays fully usable.
 *
 * Coordinates are LOGICAL pixels in the primary display's space (top-left
 * origin), matching the screenshots the agent reasons over, so a CSS point in
 * the overlay lines up 1:1 with the agent's tool coordinates.
 */
import { join } from "node:path";
import { is } from "@electron-toolkit/utils";
import type { GuidanceEvent } from "@freestyle/validations";
import { BrowserWindow, screen } from "electron";

let overlayWindow: BrowserWindow | null = null;
let loaded = false;
// Latest event held until the renderer has loaded (it only needs the newest).
let pending: GuidanceEvent | null = null;

function getOverlayURL(): string {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/overlay.html`;
  }
  return "app://renderer/overlay.html";
}

/** Cover the primary display exactly (logical bounds). */
function positionOverPrimaryDisplay(win: BrowserWindow): void {
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds;
  win.setBounds({ x, y, width, height });
}

function ensureOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  loaded = false;
  const win = new BrowserWindow({
    ...screen.getPrimaryDisplay().bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    enableLargerThanScreen: true,
    // Float above full-screen apps without stealing the menu bar / Dock space.
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Purely a heads-up display: every pixel passes clicks through to whatever is
  // underneath, so the user can actually perform the step we're pointing at.
  win.setIgnoreMouseEvents(true, { forward: true });

  win.on("closed", () => {
    overlayWindow = null;
    loaded = false;
    pending = null;
  });

  win.webContents.once("did-finish-load", () => {
    loaded = true;
    if (pending) {
      win.webContents.send("overlay:guidance", pending);
      pending = null;
    }
  });

  void win.loadURL(getOverlayURL());
  overlayWindow = win;
  return win;
}

/** Push a guidance step to the overlay, creating/showing it as needed. */
export function showGuidance(event: GuidanceEvent): void {
  const win = ensureOverlayWindow();
  positionOverPrimaryDisplay(win);
  if (!win.isVisible()) win.showInactive();
  if (loaded) {
    win.webContents.send("overlay:guidance", event);
  } else {
    pending = event; // flushed on did-finish-load
  }
}

/** Clear any guidance and hide the overlay (e.g. when a run ends). */
export function hideGuidanceOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (loaded)
    overlayWindow.webContents.send("overlay:guidance", { kind: "clear" });
  pending = null;
  overlayWindow.hide();
}

/**
 * Run `fn` with the overlay hidden, then restore it. Used to take a clean
 * screenshot in guided mode so the ghost cursor never appears in what the model
 * sees. No-op when the overlay isn't currently shown.
 */
export async function withOverlayHidden<T>(fn: () => Promise<T>): Promise<T> {
  const win = overlayWindow;
  const wasVisible = !!win && !win.isDestroyed() && win.isVisible();
  if (wasVisible) win.hide();
  try {
    return await fn();
  } finally {
    if (wasVisible && win && !win.isDestroyed()) win.showInactive();
  }
}

/** Tear down the overlay window (app shutdown). */
export function destroyOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
  overlayWindow = null;
}
