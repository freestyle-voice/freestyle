import { join } from "node:path";
import { BrowserWindow, screen } from "electron";
import type { SpriteId } from "../shared/sprites";
import { SPRITES_INFO } from "../shared/sprites";
import { rendererUrl } from "./renderer-url";

const WIDTH = 300;
const DEFAULT_HEIGHT = 140;
const GAP = 6;
const TAIL_OFFSET = 29;
const MAX_HEIGHT = 460;

let win: BrowserWindow | null = null;
let contentHeight = DEFAULT_HEIGHT;
let hiddenForTravel = false;
let wantsVisible = false;

interface Host {
  spriteForm: () => SpriteId;
  companionBounds: () => { x: number; y: number; width: number } | null;
}

let host: Host = {
  spriteForm: () => "jeb" as SpriteId,
  companionBounds: () => null,
};

export function initNotificationWindow(next: Host): void {
  host = next;
}

function anchorBounds(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const height = Math.min(Math.max(contentHeight, 60), MAX_HEIGHT);
  const info = SPRITES_INFO[host.spriteForm()];
  const bounds = host.companionBounds();
  const cursor = screen.getCursorScreenPoint();
  const homeDisplay = screen.getDisplayNearestPoint(cursor);
  const windowX = bounds ? bounds.x : homeDisplay.workArea.x;
  const windowY = bounds
    ? bounds.y
    : homeDisplay.workArea.y + homeDisplay.workArea.height - info.windowSize;
  const bodyTop = windowY + info.body.y;
  const bodyCenterX = windowX + info.body.x + info.body.width / 2;
  const display = screen.getDisplayNearestPoint({
    x: Math.round(bodyCenterX),
    y: Math.round(bodyTop + info.body.height / 2),
  });
  const { x: waX, y: waY, width: waW } = display.workArea;

  const x = Math.min(
    Math.max(Math.round(bodyCenterX - TAIL_OFFSET), waX + 4),
    waX + waW - WIDTH - 4,
  );
  const y = Math.max(Math.round(bodyTop - height - GAP), waY + 4);
  return { x, y, width: WIDTH, height };
}

export function createNotificationWindow(): void {
  if (win && !win.isDestroyed()) return;

  const bounds = anchorBounds();
  win = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.on("closed", () => {
    win = null;
  });

  void win.loadURL(rendererUrl("notification.html"));
}

export function destroyNotificationWindow(): void {
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}

export function notificationWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null;
}

export function setNotificationHeight(height: number): void {
  contentHeight = Math.round(height);
  reposition();
}

export function reposition(): void {
  const target = notificationWindow();
  if (!target) return;
  target.setBounds(anchorBounds());
}

export function showNotifications(): void {
  wantsVisible = true;
  if (hiddenForTravel) return;
  createNotificationWindow();
  const target = notificationWindow();
  if (!target) return;
  reposition();
  if (!target.isVisible()) target.showInactive();
}

export function hideNotifications(): void {
  wantsVisible = false;
  notificationWindow()?.hide();
}

export function setTravelling(travelling: boolean): void {
  hiddenForTravel = travelling;
  if (travelling) {
    notificationWindow()?.hide();
    return;
  }
  if (wantsVisible) showNotifications();
}

export function notifyRendererChanged(): void {
  notificationWindow()?.webContents.send("notifications:changed");
}
