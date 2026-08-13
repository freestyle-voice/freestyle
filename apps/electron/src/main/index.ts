// Prevent EPIPE crashes when stdout/stderr is a closed pipe (e.g. Linux
// AppImage launched detached from a terminal).
for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") return;
    throw err;
  });
}

// GUI apps on macOS inherit the minimal launchd PATH (/usr/bin:/bin:/usr/sbin:/sbin)
// which excludes Homebrew directories where cmake and other tools live.
if (process.platform === "darwin") {
  const extra = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
  ];
  const current = process.env.PATH ?? "";
  const dirs = current.split(":");
  const missing = extra.filter((p) => !dirs.includes(p));
  if (missing.length > 0) {
    process.env.PATH = `${current}:${missing.join(":")}`;
  }
}

// In development, load a local-only env file (cwd: apps/electron) so flags like
// FREESTYLE_ANALYTICS_DEV=1 take effect without exporting them in the shell.
// `process.env.NODE_ENV` is replaced at build time (see electron.vite.config.ts),
// so this whole block is dead-code-eliminated from packaged/production builds.
if (process.env.NODE_ENV !== "production") {
  const proc = process as typeof process & {
    loadEnvFile?: (path?: string) => void;
  };
  try {
    proc.loadEnvFile?.(".env.local");
  } catch {
    // no .env.local present — that's fine
  }
}

import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import {
  type AppType,
  captureException,
  closeDb,
  disposeServerPlugins,
  readSetting as readServerSetting,
  shutdownPosthog,
  startServer as startFreestyleServer,
} from "@freestyle-voice/server";
import { createAppLogger, enableFileLogging } from "@freestyle-voice/utils";
import {
  REMIX_CLIPBOARD_LIMIT,
  serverUrlSchema,
} from "@freestyle-voice/validations";
import {
  app,
  BrowserWindow,
  clipboard,
  type Display,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  nativeImage,
  net,
  protocol,
  screen,
  shell,
  systemPreferences,
  Tray,
} from "electron";
import { autoUpdater } from "electron-updater";
import { hc } from "hono/client";
import icon from "../../resources/icon.png?asset";
import trayIconPath from "../../resources/tray/logoTemplate.png?asset";
import {
  type AudioPlaybackMode,
  isActiveAudioPlaybackMode,
} from "../shared/audio-playback";
import {
  type CompanionForm,
  type CompanionState,
  parseCompanionForm,
  parseDictationDestination,
} from "../shared/companion";
import {
  createDictationDisplayRequestTracker,
  invalidateDictationDisplayRequest,
  resolveCompanionDisplay,
  resolvePanelCompanionDisplays,
} from "../shared/companion-position";
import {
  findFocusedSwayNode,
  getSwayFocusedWindowBounds,
  parseWindowBounds,
  type SwayNode,
  type WindowBounds,
} from "../shared/focused-window";
import { getDefaultHotkey } from "../shared/hotkey-defaults";
import type { OpenAppCandidate } from "../shared/open-apps";
import {
  COMPANION_CLEARANCE,
  PANEL_GAP,
  PANEL_HEIGHT,
  PANEL_WIDTH,
} from "../shared/panel";
import {
  getDefaultRemixHotkey,
  REMIX_CLIPBOARD_PREVIEW_LIMIT,
} from "../shared/remix";
import { bearerAuthHeaders } from "../shared/server-auth";
import { SETTINGS_KEYS } from "../shared/settings-keys";
import { SPRITES_INFO } from "../shared/sprites";
import { AudioPlaybackController } from "./audio-control/controller";
import { recoverDuckedVolumeFromCrash } from "./audio-control/volume-ducker";
import { HotkeyRecorder } from "./hotkey-recorder";
import { normalizeAccelerator } from "./hotkey-utils";
import { NativeKeyListener } from "./key-listener";
import * as linuxAutostart from "./linux-autostart";
import { checkLinuxSetup } from "./linux-setup";
import { MicListener } from "./mic-listener";
import { getNativeBinaryPath } from "./native-binary";
import {
  hideNotifications,
  initNotificationWindow,
  notifyRendererChanged,
  setNotificationHeight,
  setTravelling,
  showNotifications,
} from "./notification-window";
import {
  copySelectionFromFocusedApp,
  isWaylandSession,
  pasteClipboardIntoFocusedApp,
  pasteIntoFocusedApp,
  startLinuxPasteHelper,
  stopLinuxPasteHelper,
} from "./paste";
import {
  type DictationPermission,
  missingDictationPermission,
  resolveAccessibilityPermission,
  type StartupPermissionWarning,
  startupPermissionWarning,
} from "./permission-checks";
import {
  FreestyleEventType,
  OutputMode,
  PipelineStage,
  relayEvent,
} from "./plugins/index";
import { invalidatePluginViews } from "./plugins/ui-host";
import { isRemixTargetAllowed } from "./remix-target";
import {
  initSpriteTravel,
  performSyncAction,
  resolveSpriteImpact,
  resolveSpritePerformDone,
} from "./sprite-travel";

// Test isolation: E2E/probe runs in the unpackaged dev binary would otherwise
// share the real "Electron" userData (settings.json included) with a running
// dev instance. Must be set before anything reads app.getPath("userData").
if (process.env.FREESTYLE_USER_DATA) {
  app.setPath("userData", process.env.FREESTYLE_USER_DATA);
}

const log = createAppLogger("electron");
const hotkeyLog = createAppLogger("hotkey");
const hotkeyRecorderLog = createAppLogger("hotkey-recorder");

// Persist all logs (this process + the in-process server) to a single rotating
// file so users can share diagnostics. `app.getPath("logs")` resolves to
// ~/Library/Logs/Freestyle (macOS), %APPDATA%\Freestyle\logs (Windows), or
// ~/.config/Freestyle/logs (Linux). enableFileLogging() is order-independent:
// it also back-fills loggers that were created during module import.
let logsDir = "";
try {
  logsDir = app.getPath("logs");
  enableFileLogging(logsDir);
  log.info(`File logging enabled at ${logsDir}`);
} catch (err) {
  log.error(`Failed to enable file logging: ${String(err)}`);
}

// Global crash handlers — without these, errors in the main process vanish
// silently (no console in a packaged app). Log + report to PostHog, then for a
// truly uncaught exception show a dialog and quit, since process state is
// unknown after that point.
let isHandlingFatal = false;
process.on("uncaughtException", (err, origin) => {
  if (isHandlingFatal) return;
  isHandlingFatal = true;
  log.error(`Uncaught exception (${origin}): ${err?.stack ?? String(err)}`);
  try {
    captureException(err, { source: "main", origin });
  } catch {
    // never let reporting block the crash path
  }
  try {
    dialog.showMessageBoxSync({
      type: "error",
      title: "Freestyle ran into a problem",
      message: "Freestyle hit an unexpected error and needs to close.",
      detail:
        `${String(err?.message ?? err)}\n\n` + `Logs are saved at:\n${logsDir}`,
      buttons: ["Quit"],
    });
  } catch {
    // dialog may be unavailable before the app is ready
  }
  void shutdownPosthog()
    .catch(() => {})
    .finally(() => app.exit(1));
});

process.on("unhandledRejection", (reason) => {
  log.error(
    `Unhandled rejection: ${
      reason instanceof Error
        ? (reason.stack ?? reason.message)
        : String(reason)
    }`,
  );
  try {
    captureException(
      reason instanceof Error ? reason : new Error(String(reason)),
      { source: "main", kind: "unhandledRejection" },
    );
  } catch {
    // best-effort
  }
});

const DEFAULT_PORT = 4649;
/**
 * The pill's own slot: every position in this file is computed against these
 * dimensions, whatever size the window currently is. See `pillExpandOffset`.
 */
const APP_WIDTH = 160;
const APP_HEIGHT = 60;
/**
 * The window is grown to this while the renderer shows its expanded status
 * card (a failure the user has to answer — see `pill:set-expanded`). The extra
 * area is transparent and empty, so it stays collapsed the rest of the time
 * rather than sitting over the user's screen as a dead zone.
 */
const PILL_CARD_WIDTH = 340;
const PILL_CARD_HEIGHT = 144;
/** Held for the whole remix session so mid-morph setBounds doesn't blink. */
const PILL_CHAT_WIDTH = 440;
const PILL_CHAT_HEIGHT = 600;

type PillExpansion = "card" | "remix-chat";

function pillExpansionSize(expansion: PillExpansion): {
  width: number;
  height: number;
} {
  if (expansion === "remix-chat") {
    return { width: PILL_CHAT_WIDTH, height: PILL_CHAT_HEIGHT };
  }
  return { width: PILL_CARD_WIDTH, height: PILL_CARD_HEIGHT };
}

// Hot-rect: click-through except the reported surface; poll flips interactivity.

type PillHotRect = { x: number; y: number; width: number; height: number };
let pillHotRect: PillHotRect | null = null;
let pillHotPollTimer: NodeJS.Timeout | null = null;

function stopPillHotPoll(): void {
  if (pillHotPollTimer) {
    clearInterval(pillHotPollTimer);
    pillHotPollTimer = null;
  }
}

function setPillHotRect(rect: PillHotRect | null): void {
  // Tests drive the surfaces with synthetic DOM events; the machine's real
  // cursor must not be able to flip interactivity under them.
  if (process.env.FREESTYLE_E2E === "1") return;
  pillHotRect = rect;
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  if (!rect) {
    stopPillHotPoll();
    win.setIgnoreMouseEvents(false);
    return;
  }
  win.setIgnoreMouseEvents(true, { forward: process.platform !== "linux" });
  if (pillHotPollTimer) return;
  pillHotPollTimer = setInterval(() => {
    const w = mainWindow;
    const hot = pillHotRect;
    if (!w || w.isDestroyed() || !hot || !w.isVisible()) return;
    const bounds = w.getBounds();
    const cursor = screen.getCursorScreenPoint();
    const inside =
      cursor.x >= bounds.x + hot.x &&
      cursor.x <= bounds.x + hot.x + hot.width &&
      cursor.y >= bounds.y + hot.y &&
      cursor.y <= bounds.y + hot.y + hot.height;
    if (!inside) return;
    pillHotRect = null;
    stopPillHotPoll();
    w.setIgnoreMouseEvents(false);
    w.webContents.send("pill:hot-enter");
  }, 120);
}

// ---------------------------------------------------------------------------
// settings.json helpers — single source for read/write of the lightweight
// JSON file the main process uses for settings it needs before the server
// is available (pillPosition, onboardingComplete, autoUpdate).
// ---------------------------------------------------------------------------

let settingsCache: Record<string, unknown> | null = null;

function readSettings(): Record<string, unknown> {
  if (settingsCache) return settingsCache;
  try {
    const settingsPath = join(app.getPath("userData"), "settings.json");
    settingsCache = JSON.parse(
      require("node:fs").readFileSync(settingsPath, "utf-8"),
    );
    return settingsCache!;
  } catch {
    settingsCache = {};
    return settingsCache;
  }
}

function writeSettings(patch: Record<string, unknown>): void {
  try {
    const settingsPath = join(app.getPath("userData"), "settings.json");
    const data = { ...readSettings(), ...patch };
    require("node:fs").writeFileSync(
      settingsPath,
      JSON.stringify(data, null, 2),
    );
    settingsCache = data;
  } catch {
    // ignore
  }
}

/**
 * The configured Freestyle server URL, if the user has set one. When present,
 * the app talks to that server (for server-owned data: settings, history,
 * plugins, transcription) instead of the locally-run one. Returns an empty
 * string when using the default local server.
 *
 * The local server is always started regardless, so switching back to local
 * (or between remotes) never requires a restart — see the startup block.
 */
function getServerUrl(): string {
  const parsed = serverUrlSchema.safeParse(readSettings().serverUrl);
  return parsed.success ? parsed.data : "";
}

/** Optional bearer token sent to a configured server ("" = none). */
function getServerToken(): string {
  const raw = readSettings().serverToken;
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Authorization headers for main-process API calls to a configured server.
 * Empty when no token is set (the default local-server case), so loopback
 * requests are unaffected.
 */
function getServerAuthHeaders(): Record<string, string> {
  return bearerAuthHeaders(getServerToken());
}

/**
 * Typed `hc` client bound to the current server target (local or configured
 * remote) with auth headers — the main-process counterpart to the renderer's
 * getClient(). Reads the target per call, so it always tracks the latest
 * server:changed state without a restart.
 */
function serverClient() {
  return hc<AppType>(getServerBaseUrl(), { headers: getServerAuthHeaders() });
}

/** Relay a main-process pipeline event to the current server target with auth. */
function relayServerEvent(event: Parameters<typeof relayEvent>[1]): void {
  relayEvent(getServerBaseUrl(), event, getServerAuthHeaders());
}

/**
 * Base URL the app uses to reach the Freestyle server: the configured remote
 * URL, or the locally-run server on the resolved port. The DB lives behind the
 * server, so all server-owned data (settings, plugins) is read through it.
 */
function getServerBaseUrl(): string {
  return getServerUrl() || `http://127.0.0.1:${serverPort}`;
}

/**
 * Broadcast a server target change (URL/token) to all renderer windows so they
 * re-point their API clients and refetch, without an app restart. Cached plugin
 * views are dropped too, since they hold pages loaded from the previous origin.
 */
function broadcastServerChanged(): void {
  panelWindow?.webContents.send("server:changed");
  companionWindow?.webContents.send("server:changed");
  invalidatePluginViews();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let httpServer: any = null;
let serverPort = DEFAULT_PORT;
const mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let keyListener: NativeKeyListener | null = null;
// Latching flag: records that the native key listener started successfully.
// It persists while the listener is temporarily torn down for hotkey recording,
// but is never used to override the current macOS Accessibility trust result.
let accessibilityConfirmed = false;
let hotkeyPressed = false;
let currentHotkeyAccel: string | null = null;
let hotkeyActivationMode: "hold" | "toggle" = "hold";
let micListener: MicListener | null = null;
let hotkeyRecorder: HotkeyRecorder | null = null;
/** Own listener process — native binaries only take one accelerator each. */
let remixKeyListener: NativeKeyListener | null = null;
/** User-configured accel (may differ from what's listening while parked/off). */
let remixHotkeyPreference: string | undefined;
/** False until server settings are read once (don't spawn on defaults). */
let remixInitialized = false;
/** Onboarding practice: allow Remix to target Freestyle's own window. */
const remixPracticeTarget = false;
const audioPlaybackController = new AudioPlaybackController();

function stopHotkeyRecorderProcess(): void {
  hotkeyRecorder?.stop();
  hotkeyRecorder = null;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      // Without this, Chromium's media stack refuses to play <video>/<audio>
      // served from the scheme (the sign-in demo video, for one).
      stream: true,
    },
  },
]);

function registerAppProtocol(): void {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let filePath = join(
      __dirname,
      "../renderer",
      decodeURIComponent(url.pathname),
    );

    // The dashboard SPA (and its extensionless routes) is gone; the panel is
    // the only sensible fallback for a bare path.
    if (!filePath.match(/\.\w+$/)) {
      filePath = join(__dirname, "../renderer/panel.html");
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

// The pill's programmatic-move filter is gone with the pill; the remaining
// caller in the legacy bounds path needs only a no-op.
function markProgrammaticTarget(_x: number, _y: number): void {}

/**
 * How far the window's origin has been pushed out to make room for the
 * expanded card, so the pill itself doesn't move. Zero while collapsed.
 *
 * Everything else in this file works in *slot* coordinates — where the
 * collapsed 160x60 pill sits — and this offset is applied at the two places
 * that touch real window coordinates: `setProgrammaticPosition` on the way
 * out, and the `move` listener on the way in. Latching it at expand time
 * (rather than recomputing it) guarantees the collapse lands exactly where
 * the expand started, even if the anchor preference changed in between.
 */
let pillExpandOffset = { dx: 0, dy: 0 };
/** Which expanded size `pillExpandOffset` was computed for. */
let pillExpansion: PillExpansion = "card";

/** Which capsule edge stays pinned when the window grows around the pill. */
function getPillAnchor(): { side: "center" | "right"; edge: "top" | "bottom" } {
  const position = (readSettings().pillPosition as string) || "bottom-center";
  if (position === "custom") {
    return {
      side: "center",
      edge: getPillAlignmentForCustom() === "custom-top" ? "top" : "bottom",
    };
  }
  return {
    side: position.endsWith("right") ? "right" : "center",
    edge: position.startsWith("top") ? "top" : "bottom",
  };
}

/**
 * Grow/shrink the pill window around the pill, keeping the capsule's anchored
 * edge fixed on screen. The renderer drives this: it asks for the room a beat
 * before it animates the card in, and gives it back once the card is gone.
 */
function setPillExpanded(
  expanded: boolean,
  expansion: PillExpansion = "card",
): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  const isExpanded = pillExpandOffset.dx !== 0 || pillExpandOffset.dy !== 0;
  // No-op if already collapsed/same size; re-run on size change to keep anchor.
  if (expanded === isExpanded && !expanded) return;
  if (expanded && isExpanded && expansion === pillExpansion) {
    const size = pillExpansionSize(expansion);
    const bounds = win.getBounds();
    if (bounds.width === size.width && bounds.height === size.height) return;
  }
  if (expanded) pillExpansion = expansion;

  const previousOffset = pillExpandOffset;
  const [x, y] = win.getPosition();
  let target: { x: number; y: number; width: number; height: number };

  if (expanded) {
    const { side, edge } = getPillAnchor();
    const { width, height } = pillExpansionSize(expansion);
    pillExpandOffset = {
      dx:
        side === "right"
          ? width - APP_WIDTH
          : Math.round((width - APP_WIDTH) / 2),
      dy: edge === "top" ? 0 : height - APP_HEIGHT,
    };
    // Offset is from the collapsed slot; rebase before applying (may already be expanded).
    const slotX = x + previousOffset.dx;
    const slotY = y + previousOffset.dy;
    target = {
      x: slotX - pillExpandOffset.dx,
      y: slotY - pillExpandOffset.dy,
      width,
      height,
    };
  } else {
    target = {
      x: x + pillExpandOffset.dx,
      y: y + pillExpandOffset.dy,
      width: APP_WIDTH,
      height: APP_HEIGHT,
    };
    pillExpandOffset = { dx: 0, dy: 0 };
    // The collapsed capsule is a plain interactive window again.
    setPillHotRect(null);
  }

  markProgrammaticTarget(target.x, target.y);
  // The window is created non-resizable, which on some platforms also pins
  // its size against setBounds. Lift the constraint just for this call.
  win.setResizable(true);
  win.setBounds(target);
  win.setResizable(false);
  updatePillEscape();
}

// Returns the pill alignment token for a custom position, using the actual
// display the window resides on — safe for multi-monitor setups.
function getPillAlignmentForCustom(): "custom-top" | "custom-bottom" {
  if (!mainWindow) return "custom-bottom";
  const [wx, wy] = mainWindow.getPosition();
  const display = screen.getDisplayMatching({
    x: wx,
    y: wy,
    width: APP_WIDTH,
    height: APP_HEIGHT,
  });
  const midY = display.workArea.y + display.workArea.height / 2;
  return wy < midY ? "custom-top" : "custom-bottom";
}
/** Open the panel with the Settings view showing — the successor to every
 *  "open the dashboard at /settings" entry point. */
function openPanelSettings(): void {
  openPanel({ focusComposer: false });
  const win = panelWindow;
  if (!win || win.isDestroyed()) return;
  win.show();
  win.focus();
  const send = (): void => win.webContents.send("panel:show-settings");
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", send);
  } else {
    send();
  }
}

/**
 * Resolves once a freshly-created pill window has finished loading and is
 * visible.  `null` when no deferred show is in progress.
 */

function updatePillEscape(): void {
  const chatLike = pillExpansion === "remix-chat";
  const isExpanded = pillExpandOffset.dx !== 0 || pillExpandOffset.dy !== 0;
  if (mainWindow?.isVisible() && !(chatLike && isExpanded)) {
    if (!globalShortcut.isRegistered("Escape")) {
      globalShortcut.register("Escape", () => {
        if (mainWindow?.isVisible()) {
          mainWindow.webContents.send("pill:cancel");
        }
      });
    }
  } else {
    try {
      globalShortcut.unregister("Escape");
    } catch {}
  }
}

// -- Async helper: run a command without blocking the main thread --
function execAsync(
  cmd: string,
  args: string[],
  timeoutMs: number,
  maxBuffer?: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        encoding: "utf-8",
        timeout: timeoutMs,
        ...(maxBuffer ? { maxBuffer } : {}),
      },
      (err, stdout) => {
        if (err) reject(err);
        else resolve((stdout as string).trim());
      },
    );
  });
}

function getFreestyleAppExclusions(): Set<string> {
  return new Set(
    [app.getName(), app.name, "Freestyle", "Electron"]
      .map((name) => name?.trim().toLowerCase())
      .filter((name): name is string => Boolean(name)),
  );
}

function normalizeOpenAppCandidates(
  rawLabels: readonly string[],
): OpenAppCandidate[] {
  const exclusions = getFreestyleAppExclusions();
  const deduped = new Map<string, OpenAppCandidate>();

  for (const rawLabel of rawLabels) {
    const label = rawLabel.replace(/\s+/g, " ").trim();
    if (!label) continue;

    const match = label.toLowerCase();
    if (exclusions.has(match)) continue;

    if (!deduped.has(match)) {
      deduped.set(match, { label, match });
    }
  }

  return [...deduped.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
}

function parseContextAppLabel(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { app?: string };
    return parsed.app ? [parsed.app] : [];
  } catch {
    return [raw];
  }
}

// -- macOS: Get frontmost app + browser tab context via AppleScript --
async function getMacFrontmostApp(): Promise<string | null> {
  try {
    const appName = await execAsync(
      "osascript",
      [
        "-e",
        'tell application "System Events" to get name of first application process whose frontmost is true',
      ],
      2000,
    );

    const chromiumBrowsers = [
      "Google Chrome",
      "Arc",
      "Brave Browser",
      "Microsoft Edge",
    ];

    try {
      if (appName === "Safari") {
        const result = await execAsync(
          "osascript",
          [
            "-e",
            'tell application "Safari" to return {URL of current tab of front window, name of current tab of front window}',
          ],
          2000,
        );
        const idx = result.indexOf(", ");
        if (idx > 0) {
          return JSON.stringify({
            app: appName,
            url: result.substring(0, idx),
            title: result.substring(idx + 2),
          });
        }
      } else if (appName === "Firefox") {
        const title = await execAsync(
          "osascript",
          [
            "-e",
            'tell application "System Events" to get name of front window of application process "Firefox"',
          ],
          2000,
        );
        return JSON.stringify({ app: appName, windowTitle: title });
      } else if (chromiumBrowsers.includes(appName)) {
        const result = await execAsync(
          "osascript",
          [
            "-e",
            `tell application "${appName}" to return {URL of active tab of front window, title of active tab of front window}`,
          ],
          2000,
        );
        const idx = result.indexOf(", ");
        if (idx > 0) {
          return JSON.stringify({
            app: appName,
            url: result.substring(0, idx),
            title: result.substring(idx + 2),
          });
        }
      }
    } catch {
      // Browser tab access failed — fall back to app name only
    }

    return JSON.stringify({ app: appName });
  } catch {
    return null;
  }
}

async function getMacOpenAppCandidates(): Promise<OpenAppCandidate[]> {
  try {
    const result = await execAsync(
      "osascript",
      [
        "-e",
        'tell application "System Events" to get name of every application process whose background only is false and visible is true',
      ],
      2000,
    );

    return normalizeOpenAppCandidates(result.split(","));
  } catch {
    return [];
  }
}

// -- Windows: Get foreground window process name + title via PowerShell --
async function getWindowsFrontmostApp(): Promise<string | null> {
  try {
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class Win32 {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
          [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        }
"@
      $hwnd = [Win32]::GetForegroundWindow()
      $sb = New-Object System.Text.StringBuilder 256
      [Win32]::GetWindowText($hwnd, $sb, 256) | Out-Null
      $title = $sb.ToString()
      $pid = 0
      [Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
      $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
      "$($proc.ProcessName)|$title"
    `;
    const result = await execAsync(
      "powershell",
      ["-NoProfile", "-Command", script],
      3000,
    );

    const pipeIdx = result.indexOf("|");
    if (pipeIdx > 0) {
      const processName = result.substring(0, pipeIdx);
      const windowTitle = result.substring(pipeIdx + 1);
      return JSON.stringify({ app: processName, windowTitle });
    }
    return JSON.stringify({ app: result });
  } catch {
    return null;
  }
}

async function getWindowsOpenAppCandidates(): Promise<OpenAppCandidate[]> {
  try {
    const script = `
      $apps = Get-Process |
        Where-Object { $_.MainWindowTitle -and $_.ProcessName } |
        Select-Object -Property ProcessName |
        Sort-Object ProcessName -Unique |
        ConvertTo-Json -Compress
      $apps
    `;
    const result = await execAsync(
      "powershell",
      ["-NoProfile", "-Command", script],
      3000,
    );

    const parsed = JSON.parse(result) as
      | { ProcessName?: string }
      | Array<{ ProcessName?: string }>;
    const apps = Array.isArray(parsed) ? parsed : [parsed];

    return normalizeOpenAppCandidates(
      apps
        .map((entry) => entry.ProcessName?.trim())
        .filter((entry): entry is string => Boolean(entry)),
    );
  } catch {
    return [];
  }
}

// -- Linux: Get active window name + title (Wayland compositors + X11) --
async function getLinuxFrontmostApp(): Promise<string | null> {
  if (isWaylandSession()) {
    return (
      (await getSwayFrontmostApp()) ??
      (await getGnomeFrontmostApp()) ??
      (await getLinuxX11FrontmostApp())
    );
  }
  return getLinuxX11FrontmostApp();
}

async function getSwayFrontmostApp(): Promise<string | null> {
  try {
    const output = await execAsync("swaymsg", ["-t", "get_tree"], 2000);
    const focused = findFocusedSwayNode(JSON.parse(output) as SwayNode);
    if (!focused) return null;
    return JSON.stringify({
      app: focused.app_id ?? focused.window_properties?.class ?? "Unknown",
      windowTitle: focused.name ?? "",
    });
  } catch {
    return null;
  }
}

async function getGnomeFrontmostApp(): Promise<string | null> {
  try {
    const output = await execAsync(
      "gdbus",
      [
        "call",
        "--session",
        "--dest",
        "org.gnome.Shell",
        "--object-path",
        "/org/gnome/Shell/Introspect",
        "--method",
        "org.gnome.Shell.Introspect.GetWindows",
      ],
      2000,
    );
    for (const win of output.split(/uint64 \d+:/).slice(1)) {
      if (!/'has-focus':\s*<true>/.test(win)) continue;
      const app =
        /'wm-class':\s*<'((?:[^'\\]|\\.)*)'>/.exec(win)?.[1] ?? "Unknown";
      const title = /'title':\s*<'((?:[^'\\]|\\.)*)'>/.exec(win)?.[1] ?? "";
      return JSON.stringify({ app, windowTitle: title });
    }
    return null;
  } catch {
    return null;
  }
}

async function getLinuxX11FrontmostApp(): Promise<string | null> {
  try {
    const windowTitle = await execAsync(
      "xdotool",
      ["getactivewindow", "getwindowname"],
      2000,
    );

    let processName = "";
    try {
      const pid = await execAsync(
        "xdotool",
        ["getactivewindow", "getwindowpid"],
        2000,
      );
      processName = await execAsync("cat", [`/proc/${pid}/comm`], 1000);
    } catch {
      // some windows don't expose PID
    }

    return JSON.stringify({
      app: processName || "Unknown",
      windowTitle,
    });
  } catch {
    return null;
  }
}

async function getLinuxOpenAppCandidates(): Promise<OpenAppCandidate[]> {
  try {
    const result = await execAsync("wmctrl", ["-lx"], 2000);
    const labels = result
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        const wmClass = parts[3] ?? "";
        return wmClass.split(".").at(-1)?.replace(/[_-]+/g, " ") ?? "";
      });

    const candidates = normalizeOpenAppCandidates(labels);
    if (candidates.length > 0) return candidates;
  } catch {
    // Fall back to the current app only when a visible window list is unavailable.
  }

  return normalizeOpenAppCandidates(
    parseContextAppLabel(await getLinuxFrontmostApp()),
  );
}

async function getOpenAppCandidates(): Promise<OpenAppCandidate[]> {
  if (process.platform === "darwin") {
    return getMacOpenAppCandidates();
  }
  if (process.platform === "win32") {
    return getWindowsOpenAppCandidates();
  }
  if (process.platform === "linux") {
    return getLinuxOpenAppCandidates();
  }
  return [];
}

function hidePill(): void {
  if (mainWindow?.isVisible()) {
    mainWindow.hide();
  }
  // The next session starts as a bare capsule, so give the extra room back
  // now — the renderer's own collapse only runs when it animates a card away.
  setPillExpanded(false);
  // Session ended (cancel, error, or paste complete). Clear latched hotkey
  // state so the next press starts fresh — e.g. after ESC while still
  // holding the dictation key.
  hotkeyPressed = false;
  clearHotkeyStuckWatchdog();
  clearRemixStuckWatchdog();
  setRemixRouteKeys(false);
  // Chat may have set focusable; clear it when hiding.
  try {
  } catch {}
  updateRemixBar();
  // Unregister Escape shortcut when pill is hidden
  try {
    globalShortcut.unregister("Escape");
  } catch {}
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mechanically deliver final dictation text to the user's focused app — paste
 * or copy, exactly as resolved. The `beforeOutput` plugin hook already ran
 * server-side (`POST /api/output/deliver`, called by the renderer before this
 * is invoked), so `text`/`mode` here are the host's final word: no hook runs
 * in this process anymore. Emits the `outputDelivered` event (relayed to the
 * server's `event` hook sink) with whatever mode was ultimately used.
 */
async function deliverOutput(
  text: string,
  mode: typeof OutputMode.Paste | typeof OutputMode.Clipboard,
): Promise<void> {
  if (!text.trim()) {
    relayServerEvent({
      type: FreestyleEventType.OutputDelivered,
      text,
      mode: OutputMode.None,
    });
    return;
  }

  try {
    if (mode === OutputMode.Paste) {
      await pasteIntoFocusedApp(text);
    } else {
      clipboard.writeText(text);
    }
  } catch (err) {
    // pasteIntoFocusedApp left the transcript on the clipboard — tell the user
    // instead of letting the dictation silently vanish.
    notifyPasteFailed();
    relayServerEvent({
      type: FreestyleEventType.PipelineError,
      stage: PipelineStage.Output,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  relayServerEvent({
    type: FreestyleEventType.OutputDelivered,
    text,
    mode,
  });
}

// Per-request timeout for main-process API calls to the server.
const SERVER_SETTING_TIMEOUT_MS = 5000;
// How long boot waits for the server to answer before registering the hotkey
// with whatever it can read (falling back to the default accelerator).
const SERVER_READY_TIMEOUT_MS = 5000;

async function putServerSetting(key: string, value: string): Promise<boolean> {
  try {
    const res = await serverClient().api.settings[":key"].$put(
      { param: { key }, json: { value } },
      { init: { signal: AbortSignal.timeout(SERVER_SETTING_TIMEOUT_MS) } },
    );
    return res.ok;
  } catch (err) {
    log.warn(`Failed to save setting "${key}":`, err);
    return false;
  }
}

/**
 * Read all server-owned settings in one request. Returns `null` when the server
 * is unreachable — distinct from an empty map (server reachable, nothing
 * stored) so callers don't mistake a network blip for "unset" and clobber
 * last-known-good values (e.g. reverting the hotkey mode to its default).
 *
 * All server-owned state (settings, models, history, plugins) lives behind the
 * server — local or a configured remote — so the main process reads it through
 * the API rather than opening the SQLite file directly. This keeps a single
 * source of truth and makes a configured remote server behave identically.
 */
async function getServerSettings(): Promise<Record<string, string> | null> {
  try {
    const res = await serverClient().api.settings.$get(
      {},
      { init: { signal: AbortSignal.timeout(SERVER_SETTING_TIMEOUT_MS) } },
    );
    if (!res.ok) return null;
    return (await res.json()) as Record<string, string>;
  } catch {
    return null;
  }
}

/**
 * Probe `/api/health` at `baseUrl` and confirm it's actually a Freestyle server
 * (not some other service that happens to hold the port). Returns false on any
 * network error or non-matching identity.
 */
async function probeServerHealth(
  baseUrl: string,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const res = await net.fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string; name?: string };
    return data.status === "ok" && data.name === "freestyle";
  } catch {
    return false;
  }
}

/**
 * Resolve once the current server target answers `/api/health`, or after
 * `timeoutMs`. Used at boot before the first settings read, since the local
 * server starts asynchronously (fire-and-forget) and may not be listening yet.
 */
async function waitForServerReady(
  timeoutMs = SERVER_READY_TIMEOUT_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeServerHealth(getServerBaseUrl(), 1000)) return true;
    await wait(150);
  }
  return false;
}

// Dev-only: reset every sector tone to off and cleanup intensity to medium.
async function resetToneConfiguration(): Promise<void> {
  const resets: ReadonlyArray<readonly [string, string]> = [
    [SETTINGS_KEYS.cleanupPersonalTone, "off"],
    [SETTINGS_KEYS.cleanupWorkTone, "off"],
    [SETTINGS_KEYS.cleanupEmailTone, "off"],
    [SETTINGS_KEYS.cleanupOverallTone, "off"],
    [SETTINGS_KEYS.cleanupIntensity, "medium"],
  ];

  // Always write through the server so the values land in the DB the app reads
  // from — local or a configured remote.
  const results = await Promise.all(
    resets.map(([key, value]) => putServerSetting(key, value)),
  );
  if (results.some((ok) => !ok)) {
    log.warn("Reset tone configuration failed: one or more settings rejected");
  }
}

async function factoryReset(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Cancel", "Hard Reset"],
    defaultId: 0,
    cancelId: 0,
    title: "Hard Reset (Dev)",
    message: "Delete all Freestyle settings & data and restart?",
    detail:
      "Removes settings, API keys, history, and dictionary/vocabulary, then " +
      "relaunches into onboarding. Downloaded voice models are kept. macOS " +
      "Microphone/Accessibility permissions are not affected.",
  });
  if (response !== 1) return;

  try {
    if (keyListener) {
      keyListener.stop();
      keyListener = null;
    }
    if (micListener) {
      micListener.stop();
      micListener = null;
    }
    if (process.platform === "win32") {
      globalShortcut.unregisterAll();
    }

    try {
      closeDb();
    } catch {}

    if (httpServer) {
      httpServer.close();
      httpServer = null;
    }

    const userData = app.getPath("userData");
    for (const f of [
      "settings.json",
      "freestyle.db",
      "freestyle.db-wal",
      "freestyle.db-shm",
    ]) {
      await rm(join(userData, f), { force: true });
    }

    settingsCache = null;
    if (process.platform === "linux") {
      linuxAutostart.setEnabled(false);
    } else {
      app.setLoginItemSettings({ openAtLogin: false });
    }

    app.relaunch();
    app.exit(0);
  } catch (err) {
    log.error(
      `factory-reset failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    dialog.showErrorBox(
      "Hard Reset failed",
      `${err instanceof Error ? err.message : String(err)}\n\nThe app may be in a partially reset state. Quit and relaunch manually.`,
    );
  }
}

const ACCESSIBILITY_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility";
const MICROPHONE_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Microphone";

function hasCurrentAccessibilityPermission(): boolean {
  if (process.platform !== "darwin") return true;
  const state = resolveAccessibilityPermission(
    process.platform,
    systemPreferences.isTrustedAccessibilityClient(false),
    accessibilityConfirmed,
  );
  if (accessibilityConfirmed && !state.accessibilityConfirmed) {
    hotkeyLog.warn("macOS Accessibility permission is no longer available.");
  }
  accessibilityConfirmed = state.accessibilityConfirmed;
  return state.granted;
}

function getMissingDictationPermission(): DictationPermission | null {
  const microphoneStatus = getCurrentMicrophonePermission();
  return missingDictationPermission(
    process.platform,
    hasCurrentAccessibilityPermission(),
    microphoneStatus,
  );
}

function getCurrentMicrophonePermission(): string {
  return process.platform === "darwin" || process.platform === "win32"
    ? systemPreferences.getMediaAccessStatus("microphone")
    : "unknown";
}

function openAccessibilitySettings(): void {
  if (process.platform !== "darwin") return;
  // Passing true adds Freestyle to the Accessibility list and shows the native
  // prompt; macOS still requires the user to enable the toggle themselves.
  systemPreferences.isTrustedAccessibilityClient(true);
  void shell.openExternal(ACCESSIBILITY_SETTINGS_URL);
}

function openMicrophoneSettings(): void {
  if (process.platform === "darwin") {
    void shell.openExternal(MICROPHONE_SETTINGS_URL);
  } else if (process.platform === "win32") {
    void shell.openExternal("ms-settings:privacy-microphone");
  }
}

let permissionDialogPromise: Promise<void> | null = null;

function showRequiredPermissionDialog(
  permission: StartupPermissionWarning,
): Promise<void> {
  if (permissionDialogPromise) return permissionDialogPromise;

  const accessibility = permission === "accessibility";
  const both = permission === "accessibility-and-microphone";
  permissionDialogPromise = dialog
    .showMessageBox({
      type: "error",
      title: both
        ? "Permissions Required"
        : accessibility
          ? "Accessibility Permission Required"
          : "Microphone Permission Required",
      message: both
        ? "Accessibility and Microphone permissions are required before dictation can work."
        : accessibility
          ? "Accessibility permission is required for dictation and text insertion."
          : "Microphone access is required to record dictation.",
      detail: both
        ? "Enable Freestyle in System Settings > Privacy & Security under Accessibility and Microphone."
        : accessibility
          ? "Enable Freestyle in System Settings > Privacy & Security > Accessibility."
          : process.platform === "darwin"
            ? "Enable Freestyle in System Settings > Privacy & Security > Microphone."
            : "Enable microphone access for Freestyle in Windows Settings.",
      buttons: both
        ? ["Open Accessibility Settings", "Open Microphone Settings", "Not Now"]
        : ["Open System Settings", "Cancel"],
      defaultId: 0,
      cancelId: both ? 2 : 1,
    })
    .then(({ response }) => {
      if (both) {
        if (response === 0) openAccessibilitySettings();
        if (response === 1) openMicrophoneSettings();
      } else if (response === 0 && accessibility) {
        openAccessibilitySettings();
      } else if (response === 0) {
        openMicrophoneSettings();
      }
    })
    .finally(() => {
      permissionDialogPromise = null;
    });
  return permissionDialogPromise;
}

function isRunningFromReadOnlyLocation(): boolean {
  if (process.platform !== "darwin") return false;
  const exePath = app.getPath("exe");
  if (
    exePath.startsWith("/Volumes/") ||
    exePath.includes("/AppTranslocation/")
  ) {
    return true;
  }
  try {
    const { accessSync, constants } = require("node:fs");
    accessSync(dirname(exePath), constants.W_OK);
    return false;
  } catch {
    return true;
  }
}

const READ_ONLY_UPDATE_RE = /EROFS|EACCES|read[- ]only|permission denied/i;

let readOnlyDialogShown = false;

function showMoveToApplicationsDialog(): void {
  if (readOnlyDialogShown) return;
  readOnlyDialogShown = true;
  dialog.showMessageBox({
    type: "warning",
    title: "Move to Applications",
    message:
      "Freestyle is running from a read-only location and can\u2019t update itself.",
    detail:
      "Please drag Freestyle into your Applications folder and relaunch it from there.",
    buttons: ["OK"],
  });
}

function restartAndUpdate(): void {
  isUpdaterQuitting = true;
  autoUpdater.quitAndInstall();
}

/** Mark state as downloading, notify the settings window, and kick off the download. */
function triggerDownloadUpdate(): void {
  updateDownloadState = "downloading";
  autoUpdater.downloadUpdate().catch((err) => {
    log.warn(`downloadUpdate rejected: ${err}`);
  });
}

async function checkForUpdatesFromMenu(): Promise<void> {
  if (is.dev) {
    dialog.showMessageBox({
      type: "info",
      title: "Check for Updates",
      message: "Update checking is not available in development mode.",
    });
    return;
  }
  if (isRunningFromReadOnlyLocation()) {
    showMoveToApplicationsDialog();
    return;
  }
  if (updateDownloadState === "downloaded") {
    restartAndUpdate();
    return;
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    // Swallow the auto-download rejection (see runUpdateCheck).
    void result?.downloadPromise?.catch(() => {});
    const latest = result?.updateInfo?.version;
    if (latest && latest !== app.getVersion()) {
      const { response } = await dialog.showMessageBox({
        type: "info",
        title: "Update Available",
        message: `A new version (v${latest}) is available.`,
        detail: `You are currently running v${app.getVersion()}.`,
        buttons: ["Download", "Later"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) {
        triggerDownloadUpdate();
      }
    } else {
      dialog.showMessageBox({
        type: "info",
        title: "No Updates",
        message: "You are running the latest version.",
        detail: `Current version: v${app.getVersion()}`,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (READ_ONLY_UPDATE_RE.test(msg) && isRunningFromReadOnlyLocation()) {
      showMoveToApplicationsDialog();
    } else {
      dialog.showMessageBox({
        type: "error",
        title: "Update Check Failed",
        message: "Unable to check for updates. Please try again later.",
      });
    }
  }
}

function buildUpdateMenuItem(): { label: string; click: () => void } {
  return updateDownloadState === "downloaded"
    ? { label: "Restart & Update", click: () => restartAndUpdate() }
    : { label: "Check for Updates...", click: () => checkForUpdatesFromMenu() };
}

function buildTrayContextMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: "Settings",
      click: () => openPanelSettings(),
    },
    {
      label: "Help",
      click: () => void shell.openExternal("https://freestylevoice.com"),
    },
    buildUpdateMenuItem(),
    ...(is.dev
      ? [
          { type: "separator" as const },
          {
            label: "Reset Tone Configuration",
            click: () => {
              void resetToneConfiguration();
            },
          },
          {
            label: "Hard Reset",
            click: () => {
              void factoryReset();
            },
          },
        ]
      : []),
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);
}

function createTray(): void {
  const trayImage = nativeImage.createFromPath(trayIconPath);
  // Mark as template so macOS adapts to menu bar light/dark
  trayImage.setTemplateImage(true);

  tray = new Tray(trayImage);
  tray.setToolTip("Freestyle");

  if (process.platform === "linux") {
    // Linux desktop panels often don't fire the right-click event, so
    // assign the menu natively so the OS can register it via DBusMenu.
    tray.setContextMenu(buildTrayContextMenu());
  } else {
    // macOS/Windows: left-click opens settings, right-click shows menu.
    // Using setContextMenu on macOS would override the click handler.
    tray.on("right-click", () => {
      tray!.popUpContextMenu(buildTrayContextMenu());
    });
  }

  tray.on("click", () => {
    openPanel({ focusComposer: true });
  });
}

// Rebuild the application menu so update-related labels stay current.
function rebuildMenus(): void {
  const appMenu = Menu.buildFromTemplate([
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              {
                label: "Settings",
                accelerator: "CommandOrControl+,",
                click: () => openPanelSettings(),
              },
              { type: "separator" as const },
              buildUpdateMenuItem(),
              ...(is.dev
                ? [
                    { type: "separator" as const },
                    {
                      label: "Reset Tone Configuration",
                      click: () => {
                        void resetToneConfiguration();
                      },
                    },
                    {
                      label: "Hard Reset",
                      click: () => {
                        void factoryReset();
                      },
                    },
                  ]
                : []),
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      role: "window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Freestyle Help",
          click: () => void shell.openExternal("https://freestylevoice.com"),
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(appMenu);

  // On Linux the tray menu is static (setContextMenu), so rebuild it
  // when update state changes. macOS/Windows rebuild on every right-click.
  if (process.platform === "linux") {
    tray?.setContextMenu(buildTrayContextMenu());
  }
}

// Prevent multiple instances.  If another instance already holds the lock,
// quit immediately and let the primary instance handle activation.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on("second-instance", () => {
  openPanel({ focusComposer: true });
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  void startLinuxPasteHelper();
  void recoverDuckedVolumeFromCrash();

  // Set app user model id for windows
  electronApp.setAppUserModelId("com.freestyle.app");

  // Override app.name so macOS menu shows "Freestyle" instead of the package name
  app.setName("Freestyle");

  // Register the custom app:// protocol for production SPA support
  registerAppProtocol();

  rebuildMenus();

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC: paste text at cursor. `appContext` is accepted for backward
  // compatibility with the preload signature but is unused here — the
  // `beforeOutput` hook already ran server-side (`POST /api/output/deliver`)
  // with it before the renderer called this.
  ipcMain.handle(
    "paste:text",
    async (_event, text: string, _appContext?: string | null) => {
      await deliverOutput(text, OutputMode.Paste);
    },
  );

  // IPC: copy text to clipboard. See `paste:text` above re: `appContext`.
  ipcMain.handle(
    "copy:text",
    async (_event, text: string, _appContext?: string | null) => {
      await deliverOutput(text, OutputMode.Clipboard);
    },
  );

  ipcMain.handle("audio:prepare", async (_event, mode: unknown) => {
    if (!isActiveAudioPlaybackMode(mode)) return;
    await audioPlaybackController.prepare(mode);
  });

  ipcMain.handle("audio:duck", async () => {
    await audioPlaybackController.duck();
  });

  ipcMain.handle("audio:restore", async () => {
    await audioPlaybackController.restore();
  });

  // IPC: dictation-relevant settings changed in the dashboard — push the
  // fresh prefs to the companion, which owns the dictation pipeline.
  ipcMain.on("settings:output-mode-changed", () => broadcastDictationPrefs());

  ipcMain.on("settings:audio-ducking-changed", () => broadcastDictationPrefs());

  ipcMain.on("settings:audio-playback-mode-changed", () =>
    broadcastDictationPrefs(),
  );

  // IPC: fan out per-frame audio levels from the pill to other windows
  // (e.g. the Today tutorial demo) so they can render a live waveform.
  ipcMain.on("audio:level", (_event, level: number) => {
    if (typeof level !== "number") return;
  });

  // IPC: pill notifies that a transcription has finished + been pasted, so
  // history-driven views (Today, History) can refetch without polling.
  ipcMain.on("transcription:done", () => {
    panelWindow?.webContents.send("transcription:done");
  });

  ipcMain.on("recording:committed", () => {
    relayServerEvent({
      type: FreestyleEventType.RecordingCommitted,
    });
  });

  ipcMain.on("recording:cancelled", () => {
    relayServerEvent({
      type: FreestyleEventType.RecordingCancelled,
    });
  });

  // IPC: expose the server port to the renderer
  ipcMain.handle("server:port", () => serverPort);

  // IPC: read the configured server URL ("" = use the local server).
  ipcMain.handle("server:url", () => getServerUrl());

  // IPC: persist the server URL. The local server keeps running regardless, so
  // switching between local and a configured URL takes effect immediately —
  // renderers re-point their clients on the "server:changed" broadcast and on
  // the next transcription's refreshApiBase(). Invalid values are ignored.
  ipcMain.handle("server:set-url", (_event, url: unknown) => {
    const parsed = serverUrlSchema.safeParse(url);
    if (parsed.success) {
      writeSettings({ serverUrl: parsed.data });
      broadcastServerChanged();
    }
    return getServerUrl();
  });

  // IPC: read/persist the optional bearer token for a configured server.
  ipcMain.handle("server:token", () => getServerToken());
  ipcMain.handle("server:set-token", (_event, token: unknown) => {
    writeSettings({
      serverToken: typeof token === "string" ? token.trim() : "",
    });
    broadcastServerChanged();
    return getServerToken();
  });

  // IPC: reveal the diagnostic log folder so users can share freestyle.log.
  ipcMain.handle("logs:open-folder", async () => {
    if (!logsDir) return false;
    try {
      const result = await shell.openPath(logsDir);
      if (result) {
        log.error(`Failed to open logs folder: ${result}`);
        return false;
      }
      return true;
    } catch (err) {
      log.error(`Failed to open logs folder: ${String(err)}`);
      return false;
    }
  });

  ipcMain.handle("open:external", async (_event, url: unknown) => {
    if (typeof url !== "string") return false;
    try {
      const parsed = new URL(url);
      // mailto: is allowed for support/sales links (e.g. "Contact sales" in
      // the upgrade modal); everything else must be http(s).
      if (
        parsed.protocol !== "https:" &&
        parsed.protocol !== "http:" &&
        parsed.protocol !== "mailto:"
      ) {
        return false;
      }
      await shell.openExternal(parsed.toString());
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("cloud:prompt-sign-in", async () => {
    const { response } = await dialog.showMessageBox({
      type: "info",
      message: "Sign in to Freestyle Transcribe",
      detail:
        "Freestyle Transcribe needs you to sign in before it can transcribe or clean up text. Open Models settings to sign in or switch providers.",
      buttons: ["Open Models", "Not Now"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return false;
    openPanel({ focusComposer: true });
    return true;
  });

  // Shown when Freestyle Cloud reports the free-tier usage limit is exhausted.
  // "Upgrade" deep-links into the dashboard with `?upgrade=1`, which the
  // renderer's UpgradeModalProvider reads to auto-open the Pro upsell modal.
  ipcMain.handle("cloud:prompt-upgrade", async () => {
    const { response } = await dialog.showMessageBox({
      type: "info",
      message: "Usage limit reached",
      detail:
        "You've used all your agent runs for this week. Upgrade to Pro for unlimited runs, or wait for your weekly allowance to reset.",
      buttons: ["Upgrade to Pro", "Not Now"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return false;
    openPanelSettings();
    return true;
  });

  ipcMain.handle(
    "dialog:show-error",
    async (_event, title: string, detail: string) => {
      await dialog.showMessageBox({
        type: "error",
        title,
        message: title,
        detail,
        buttons: ["OK"],
      });
    },
  );

  // IPC: permission checks
  ipcMain.handle("permissions:check-mic", async () => {
    if (process.platform === "linux") {
      // Linux has no OS-level mic permission API; the renderer resolves the
      // real state with a getUserMedia probe (see lib/permissions.ts).
      return "unknown";
    }
    // macOS and Windows both report the real privacy-settings state here.
    return systemPreferences.getMediaAccessStatus("microphone");
  });

  ipcMain.handle("permissions:request-mic", async () => {
    if (process.platform === "darwin") {
      const granted = await systemPreferences.askForMediaAccess("microphone");
      return granted ? "granted" : "denied";
    }
    if (process.platform === "win32") {
      // Windows has no programmatic prompt; report the privacy-settings
      // state so the UI can send the user to Settings when it's denied.
      return systemPreferences.getMediaAccessStatus("microphone");
    }
    return "unknown"; // Linux: renderer probes getUserMedia instead
  });

  ipcMain.handle("permissions:check-accessibility", async () => {
    return hasCurrentAccessibilityPermission();
  });

  ipcMain.on("permissions:open-accessibility", () => {
    openAccessibilitySettings();
  });

  ipcMain.on("permissions:open-mic-settings", () => {
    openMicrophoneSettings();
  });

  if (process.env.FREESTYLE_E2E === "1") {
    ipcMain.on("e2e:trigger-hotkey-down", handleNativeHotkeyDown);
    ipcMain.on("e2e:trigger-hotkey-up", handleNativeHotkeyUp);
  }

  // IPC: Linux system setup (input-group access for the hotkey listener and
  // the xdotool/wtype paste fallback). Returns null on other platforms.
  ipcMain.handle("permissions:check-linux-setup", async () => {
    if (process.platform !== "linux") return null;
    return checkLinuxSetup();
  });

  // IPC: hotkey recording — global native listener + renderer DOM on macOS
  ipcMain.on("hotkey-record:start", (event) => {
    // Park remix listener while recording a hotkey.
    if (remixKeyListener) {
      remixKeyListener.stop();
      remixKeyListener = null;
    }
    // Pause the active hotkey listener so it doesn't fire during recording
    if (keyListener) {
      keyListener.stop();
      keyListener = null;
    }
    globalShortcut.unregisterAll();

    stopHotkeyRecorderProcess();
    // Whichever window asked to record receives the key events — the panel's
    // settings view and the legacy dashboard both use this channel.
    const target = event.sender;

    hotkeyRecorder = new HotkeyRecorder({
      onModifiers: () => {},
      onCaptured: () => {},
      onCancel: () => {
        stopHotkeyRecorderProcess();
        scheduleHotkeyRegistration(currentHotkeyAccel ?? undefined);
      },
      onError: (message) => {
        hotkeyRecorderLog.warn(message);
      },
    });
    hotkeyRecorder.start(target);
  });

  ipcMain.on("hotkey-record:pause-recorder", () => {
    stopHotkeyRecorderProcess();
  });

  ipcMain.on("hotkey-record:stop", (_event, hotkey?: string) => {
    stopHotkeyRecorderProcess();
    scheduleHotkeyRegistration(
      typeof hotkey === "string" && hotkey.length > 0
        ? hotkey
        : (currentHotkeyAccel ?? undefined),
    );
  });

  // Set database path for the server before any API calls
  process.env.FREESTYLE_DB_PATH = join(app.getPath("userData"), "freestyle.db");

  process.env.FREESTYLE_ENV = is.dev ? "development" : "production";
  // Expose the app version to the in-process server so PostHog events
  // (including autocaptured exceptions) carry the release they came from.
  process.env.FREESTYLE_APP_VERSION = app.getVersion();

  // Start the Hono HTTP server with WebSocket support (or reuse an existing one)
  const startServer = (port: number): void => {
    startFreestyleServer({ port, host: "127.0.0.1" })
      .then(({ server, port: boundPort }) => {
        httpServer = server;
        serverPort = boundPort;
        log.info(`Server running on http://localhost:${boundPort}`);
      })
      .catch((err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && port === DEFAULT_PORT) {
          log.warn(`Port ${DEFAULT_PORT} in use, falling back to random port`);
          startServer(0);
        } else {
          log.error(`Server failed to start: ${err}`);
        }
      });
  };

  // Check if a Freestyle server is already running on the default port. The
  // 1.5s bound matters: a normal cold start fast-fails with ECONNREFUSED, but
  // without a timeout a half-open socket on the port could hang window/tray
  // creation indefinitely.
  const existingServer = await probeServerHealth(
    `http://127.0.0.1:${DEFAULT_PORT}`,
    1500,
  );

  if (existingServer) {
    serverPort = DEFAULT_PORT;
    log.info(
      `Reusing existing Freestyle server on http://localhost:${DEFAULT_PORT}`,
    );
  } else {
    startServer(DEFAULT_PORT);
  }

  if (readSettings().companionEnabled !== false) {
    createCompanionWindow();
    registerSummonShortcut();
    initNotificationWindow({
      spriteForm: () => companionFormSetting(),
      companionBounds: () => {
        if (!companionWindow || companionWindow.isDestroyed()) return null;
        const b = companionWindow.getBounds();
        return { x: b.x, y: b.y, width: b.width };
      },
    });
    startNotificationPoll();
  }

  // A signed-out launch surfaces the panel unprompted: the sign-in gate is
  // the whole product until there's a session, and a first-time user doesn't
  // know the corner hover exists yet.
  void (async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (await probeServerHealth(getServerBaseUrl(), 1000)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const user = await serverClient()
      .api.auth.status.$get()
      .then(async (res) => (res.ok ? ((await res.json()).user ?? null) : null))
      .catch(() => null);
    if (!user) openPanel();
  })();

  createTray();

  // The pill window is retired: it hosted the legacy dictation pipeline
  // (recorder + paste), which double-delivered alongside the companion's.
  // The companion owns dictation; the pill exists only via the showPill()
  // boot-race fallback when no companion window could be created.

  // Onboarding already has dedicated permission cards. Existing users instead
  // get one actionable warning once a user-facing window can be shown.
  {
    const warning = startupPermissionWarning(
      process.platform,
      false,
      hasCurrentAccessibilityPermission(),
      getCurrentMicrophonePermission(),
    );
    if (warning) {
      void showRequiredPermissionDialog(warning);
    }
  }

  // -- Auto-update helpers --
  const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  let updateCheckTimer: ReturnType<typeof setInterval> | null = null;

  // With autoDownload on, checkForUpdates() also starts the asset download and
  // exposes it as result.downloadPromise. Swallow that rejection so a transient
  // download failure (e.g. an expired 403 from the release CDN) is handled by
  // the "error" event rather than leaking as an unhandled rejection / false
  // crash report. We avoid checkForUpdatesAndNotify(): it drops the same
  // rejection internally in a way callers can't intercept, and our own
  // "update-downloaded" handler already shows the completion notification.
  function runUpdateCheck(): void {
    autoUpdater
      .checkForUpdates()
      .then((result) => {
        void result?.downloadPromise?.catch(() => {});
      })
      .catch((err) => {
        log.warn(
          `Update check failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
  }

  function startUpdateCheckInterval(): void {
    if (updateCheckTimer) return;
    updateCheckTimer = setInterval(runUpdateCheck, UPDATE_CHECK_INTERVAL_MS);
  }

  // -- Auto-updater with IPC notifications --
  // Track versions we already notified about so periodic checks don't spam.
  // Separate flags for "available" vs "downloaded" because both events fire
  // for the same version and each deserves one notification.
  let notifiedAvailableVersion: string | null = null;
  let notifiedDownloadedVersion: string | null = null;

  if (!is.dev) {
    const autoUpdateEnabled = readSettings().autoUpdate !== false;
    autoUpdater.autoDownload = autoUpdateEnabled;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = createAppLogger("updater");

    autoUpdater.on("update-available", (info) => {
      if (autoUpdater.autoDownload) {
        updateDownloadState = "downloading";
      }
      // Only show a native notification once per discovered version
      if (
        Notification.isSupported() &&
        notifiedAvailableVersion !== info.version
      ) {
        notifiedAvailableVersion = info.version;
        const note = new Notification({
          title: "Freestyle Update Available",
          body: autoUpdater.autoDownload
            ? `Version ${info.version} is downloading…`
            : `Version ${info.version} is available. Open settings to download.`,
        });
        note.on("click", () => openPanelSettings());
        note.show();
      }
    });

    autoUpdater.on("update-downloaded", (info) => {
      updateDownloadState = "downloaded";
      // Only show a native notification once per version
      if (
        Notification.isSupported() &&
        notifiedDownloadedVersion !== info.version
      ) {
        notifiedDownloadedVersion = info.version;
        const note = new Notification({
          title: "Update Ready to Install",
          body: `Version ${info.version} has been downloaded. Restart to update.`,
        });
        note.on("click", () => openPanelSettings());
        note.show();
      }
      // No need to keep polling once the update is downloaded
      if (updateCheckTimer) {
        clearInterval(updateCheckTimer);
        updateCheckTimer = null;
      }
      rebuildMenus();
    });

    autoUpdater.on("error", (err) => {
      if (updateDownloadState === "downloading") {
        updateDownloadState = "idle";
      }
      const msg = err?.message ?? "Update failed";
      if (READ_ONLY_UPDATE_RE.test(msg) && isRunningFromReadOnlyLocation()) {
        showMoveToApplicationsDialog();
      } else {
      }
    });

    if (isRunningFromReadOnlyLocation()) {
      if (Notification.isSupported()) {
        const note = new Notification({
          title: "Move Freestyle to Applications",
          body: "Freestyle can\u2019t update from this location. Move it to your Applications folder and relaunch.",
        });
        note.on("click", () => openPanelSettings());
        note.show();
      }
    } else {
      runUpdateCheck();
      startUpdateCheckInterval();
    }
  }

  ipcMain.on("updater:download", () => {
    triggerDownloadUpdate();
  });

  ipcMain.on("updater:install", () => {
    restartAndUpdate();
  });

  ipcMain.handle("app:version", () => app.getVersion());

  ipcMain.handle("updater:check", async () => {
    if (is.dev) return null;
    try {
      const result = await autoUpdater.checkForUpdates();
      // Swallow the auto-download rejection (see runUpdateCheck).
      void result?.downloadPromise?.catch(() => {});
      const latest = result?.updateInfo?.version;
      if (!latest) return null;
      // Only report an update when the remote version is actually newer
      if (latest === app.getVersion()) return null;
      return { version: latest, downloadState: updateDownloadState };
    } catch {
      return null;
    }
  });

  // -- Auto-update setting IPC --
  ipcMain.handle("settings:auto-update", () => {
    return readSettings().autoUpdate !== false;
  });

  ipcMain.on("settings:set-auto-update", (_event, enabled: boolean) => {
    writeSettings({ autoUpdate: enabled });
    if (!is.dev) {
      autoUpdater.autoDownload = enabled;
    }
  });

  // -- Launch at startup setting IPC --
  ipcMain.handle("settings:launch-at-startup", () => {
    if (process.platform === "linux") return linuxAutostart.isEnabled();
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.on("settings:set-launch-at-startup", (_event, enabled: boolean) => {
    if (process.platform === "linux") {
      linuxAutostart.setEnabled(enabled);
      return;
    }
    app.setLoginItemSettings({ openAtLogin: enabled });
  });

  // -- Context-aware dictation: get frontmost app + browser context --
  ipcMain.handle("system:frontmost-app", async () => {
    try {
      if (process.platform === "darwin") {
        return await getMacFrontmostApp();
      }
      if (process.platform === "win32") {
        return await getWindowsFrontmostApp();
      }
      if (process.platform === "linux") {
        return await getLinuxFrontmostApp();
      }
    } catch {
      // graceful fallback
    }
    return null;
  });

  ipcMain.handle("system:open-app-candidates", async () => {
    try {
      return await getOpenAppCandidates();
    } catch {
      return [];
    }
  });

  // Register the hold-to-record hotkey immediately with the default accelerator
  // so a press right after launch is never dropped. Pass DEFAULT_HOTKEY
  // explicitly so this doesn't fire a settings request at the not-yet-ready
  // server. Once the server answers, re-register with the configured
  // accelerator + activation mode (only if they differ, to avoid a needless
  // native-listener rebuild).
  scheduleHotkeyRegistration(DEFAULT_HOTKEY);
  void waitForServerReady().then(async () => {
    // One request for both keys, instead of a read per key. Skip if the server
    // never answered — the default registered above stands.
    const settings = await getServerSettings();
    if (!settings) return;
    hotkeyActivationMode = hotkeyModeFromSettings(settings);
    const configured = hotkeyFromSettings(settings);
    const accel = configured
      ? normalizeAccelerator(configured)
      : DEFAULT_HOTKEY;
    if (accel !== currentHotkeyAccel) scheduleHotkeyRegistration(configured);
    // Wait for server settings — don't spawn a listener just to tear it down.
    applyRemixSettings(settings);
  });

  // Start microphone activity monitoring
  micListener = new MicListener({
    excludePid: process.pid,
    onStateChange: () => {},
  });
  micListener.start();

  // Listen for hotkey changes from the settings UI
  ipcMain.on("hotkey:update", (_event, newHotkey: string) => {
    scheduleHotkeyRegistration(newHotkey);
  });

  ipcMain.on("hotkey:reload", () => {
    void getServerSettings().then((settings) => {
      // Server unreachable — keep last-known-good mode/hotkey rather than
      // silently reverting to defaults on a transient blip.
      if (!settings) return;
      hotkeyActivationMode = hotkeyModeFromSettings(settings);
      scheduleHotkeyRegistration(
        hotkeyFromSettings(settings) ?? currentHotkeyAccel ?? undefined,
      );
    });
  });

  ipcMain.on("hotkey:set-mode", (_event, mode: string) => {
    hotkeyActivationMode = mode === "toggle" ? "toggle" : "hold";
    hotkeyPressed = false;
    clearHotkeyStuckWatchdog();
    scheduleHotkeyRegistration(currentHotkeyAccel ?? undefined);
  });

  // Remix: the settings UI writes the setting, then tells us to re-read it.
  ipcMain.on("remix-hotkey:reload", () => {
    void getServerSettings().then((settings) => {
      if (!settings) return;
      applyRemixSettings(settings);
    });
  });

  // Paste over selection — not deliverOutput (no trailing space / plugin pipeline).
  ipcMain.handle("remix:paste", async (_event, text: string) => {
    if (typeof text !== "string" || !text.trim()) return false;
    if (await isSecureInputActive()) {
      notifyPasteFailed();
      hotkeyLog.warn("Remix paste refused: secure input is active.");
      return false;
    }
    try {
      await pasteIntoFocusedApp(
        text,
        async () => {
          hidePill();
          await wait(0);
        },
        { trailingSpace: false },
      );
      return true;
    } catch (err) {
      notifyPasteFailed();
      hotkeyLog.error(`Remix paste failed: ${err}`);
      return false;
    }
  });

  // Remix primitives — focus the document before injecting keystrokes.

  ipcMain.handle("remix:get-context", async () => {
    if (await isSecureInputActive()) {
      return { ok: false, reason: "secure-input" };
    }
    const panelYielded = await yieldFocusToUserApp();
    try {
      const front = await getFrontmostContext();
      const ours = getFreestyleAppExclusions();
      if (!isRemixTargetAllowed(front.appName, ours, remixPracticeTarget)) {
        return { ok: false, reason: "document-not-in-front" };
      }
      remixAnchor = { ...front, capturedAt: Date.now() };
      const [selection, caps] = await Promise.all([
        copySelectionFromFocusedApp().catch(() => null),
        runMacAxCaps(),
      ]);
      hotkeyLog.info(
        `remix get-context: "${front.appName}"${selection ? ` · ${selection.length} chars selected` : " · no selection"} · precise=${caps?.settable ?? false}`,
      );
      const preview = clipboardPreviewFields();
      return {
        ok: true,
        appName: front.appName,
        windowTitle: front.windowTitle,
        url: front.url,
        selection,
        preciseSelection: caps?.settable ?? false,
        docLength: caps && caps.length >= 0 ? caps.length : null,
        clipboardPreview: preview.clipboard,
        clipboardLength: preview.clipboardLength,
      };
    } finally {
      if (panelYielded) restorePanelFocus();
    }
  });

  // AX read keeps the highlight; canvas editors return unsupported.
  ipcMain.handle("remix:read-document", async () => {
    const panelWasFocused = panelWindow?.isFocused() ?? false;
    try {
      return await readDocumentForRemix();
    } finally {
      if (panelWasFocused) restorePanelFocus();
    }
  });

  async function readDocumentForRemix(): Promise<Record<string, unknown>> {
    if (!(await focusAnchorForInjection())) {
      return { ok: false, reason: "document-not-in-front" };
    }
    const ax = await runMacAxRead();
    if (!ax?.text) return { ok: false, reason: "unsupported" };
    hotkeyLog.info(
      `remix read-document: ${ax.text.length} chars via accessibility`,
    );
    return {
      ok: true,
      text: ax.text.slice(0, 60_000),
      truncated: ax.text.length > 60_000,
      selStart: ax.selStart,
      selLen: ax.selLen,
    };
  }

  ipcMain.handle("remix:select-all", async () => {
    if (!(await focusAnchorForInjection())) {
      return { ok: false, reason: "document-not-in-front" };
    }
    if (!(await sendSelectAllToFocusedApp())) {
      return { ok: false, reason: "inject-failed" };
    }
    return { ok: true };
  });

  ipcMain.handle("remix:collapse-selection", async () => {
    if (!(await focusAnchorForInjection())) {
      return { ok: false, reason: "document-not-in-front" };
    }
    if (
      !(await runMacAxKey(124)) &&
      !(await runKeystrokeScript(["key code 124"]))
    ) {
      return { ok: false, reason: "inject-failed" };
    }
    return { ok: true };
  });

  ipcMain.handle("remix:copy", async () => {
    if (!(await focusAnchorForInjection())) {
      return { ok: false, reason: "document-not-in-front" };
    }
    // Whole-document copy after select_all can be slow in rich editors.
    const text = await copySelectionFromFocusedApp({
      timeoutsMs: [600, 2_000],
    }).catch(() => null);
    if (text === null) return { ok: false, reason: "nothing-copied" };
    return {
      ok: true,
      text: text.slice(0, 60_000),
      truncated: text.length > 60_000,
    };
  });

  ipcMain.handle("remix:set-clipboard", (_event, text: unknown) => {
    if (
      typeof text !== "string" ||
      !text ||
      text.length > REMIX_CLIPBOARD_LIMIT
    ) {
      return { ok: false, reason: "bad-text" };
    }
    clipboard.writeText(text);
    hotkeyLog.info(`remix set-clipboard: ${text.length} chars`);
    return { ok: true };
  });

  ipcMain.handle("remix:set-clipboard-image", async (_event, url: unknown) => {
    if (typeof url !== "string" || !url)
      return { ok: false, reason: "bad-url" };
    const image = await fetchRemixImage(url);
    if (!image) return { ok: false, reason: "fetch-failed" };
    clipboard.writeImage(image);
    return { ok: true };
  });

  ipcMain.handle("remix:paste-clipboard", async () => {
    if (!(await focusAnchorForInjection())) {
      return { ok: false, reason: "document-not-in-front" };
    }
    // Log length only — distinguishes empty clipboard from inject failure.
    hotkeyLog.info(
      `remix paste: injecting (clipboard: ${clipboard.readText().length} chars)`,
    );
    try {
      await pasteClipboardIntoFocusedApp();
      if (remixPracticeTarget) {
      }
      return { ok: true };
    } catch (err) {
      hotkeyLog.error(`Remix paste failed: ${err}`);
      return { ok: false, reason: "paste-failed" };
    }
  });

  ipcMain.handle(
    "remix:select-text",
    async (_event, text: unknown, occurrence: unknown) => {
      if (typeof text !== "string" || !text.trim() || text.length > 20_000) {
        return { ok: false, reason: "failed" };
      }
      const wanted =
        typeof occurrence === "number" &&
        Number.isInteger(occurrence) &&
        occurrence >= 1
          ? occurrence
          : null;
      if (!(await focusAnchorForInjection())) {
        return { ok: false, reason: "document-not-in-front" };
      }
      const ax = await runMacAxRead();
      if (!ax?.text || !ax.settable) {
        return { ok: false, reason: "unsupported" };
      }
      // Ambiguous matches error unless occurrence is named — wrong twin corrupts text.
      const positions: number[] = [];
      for (
        let at = ax.text.indexOf(text);
        at >= 0 && positions.length <= 50;
        at = ax.text.indexOf(text, at + 1)
      ) {
        positions.push(at);
      }
      if (positions.length === 0) return { ok: false, reason: "not-found" };
      if (wanted === null && positions.length > 1) {
        return { ok: false, reason: "ambiguous", matches: positions.length };
      }
      const index = positions[(wanted ?? 1) - 1];
      if (index === undefined) {
        return { ok: false, reason: "not-found", matches: positions.length };
      }
      if (!(await runMacAxSelect(index, text.length))) {
        return { ok: false, reason: "failed" };
      }
      if (remixAnchor) remixAnchor.capturedAt = Date.now();
      return { ok: true };
    },
  );

  // Undo/redo via native chord binary (non-QWERTY-safe); osascript fallback.
  ipcMain.handle("remix:undo", async () => {
    if (!(await focusAnchorForInjection())) {
      return { ok: false, reason: "document-not-in-front" };
    }
    if (!(await sendChordToFocusedApp("z", false))) {
      return { ok: false, reason: "inject-failed" };
    }
    return { ok: true };
  });

  ipcMain.handle("remix:redo", async () => {
    if (!(await focusAnchorForInjection())) {
      return { ok: false, reason: "document-not-in-front" };
    }
    if (!(await sendChordToFocusedApp("z", true))) {
      return { ok: false, reason: "inject-failed" };
    }
    return { ok: true };
  });

  ipcMain.handle(
    "remix:press-key",
    async (_event, key: unknown, times: unknown) => {
      const code =
        typeof key === "string" ? REMIX_PRESSABLE_KEYS[key] : undefined;
      if (code === undefined) return { ok: false, reason: "bad-key" };
      const count =
        typeof times === "number" && Number.isInteger(times)
          ? Math.min(Math.max(times, 1), 50)
          : 1;
      if (!(await focusAnchorForInjection())) {
        return { ok: false, reason: "document-not-in-front" };
      }
      for (let i = 0; i < count; i++) {
        if (
          !(await runMacAxKey(code)) &&
          !(await runKeystrokeScript([`key code ${code}`]))
        ) {
          return { ok: false, reason: "inject-failed", pressed: i };
        }
        if (count > 1) await wait(25);
      }
      return { ok: true };
    },
  );

  ipcMain.handle("remix:get-clipboard", () => {
    const text = clipboard.readText();
    return {
      ok: true,
      text: text.slice(0, 60_000),
      truncated: text.length > 60_000,
    };
  });

  // Preset chips: replace selection, preserve clipboard.
  ipcMain.handle("remix:paste-text", async (_event, text: unknown) => {
    if (typeof text !== "string" || !text.trim()) {
      return { ok: false, reason: "bad-text" };
    }
    if (!(await focusAnchorForInjection())) {
      return { ok: false, reason: "document-not-in-front" };
    }
    try {
      await pasteIntoFocusedApp(text, undefined, { trailingSpace: false });
      if (remixPracticeTarget) {
      }
      return { ok: true };
    } catch (err) {
      hotkeyLog.error(`Remix paste-text failed: ${err}`);
      return { ok: false, reason: "paste-failed" };
    }
  });

  // Re-read selection for typed follow-ups (document may have changed).
  ipcMain.handle("remix:recapture", async () => {
    // Pill or panel may be key window while typing — yield before Copy or we
    // read our own input.
    const panelYielded = await yieldFocusToUserApp();
    try {
      const front = await getFrontmostContext();
      const ours = getFreestyleAppExclusions();
      const inDocument = isRemixTargetAllowed(
        front.appName,
        ours,
        remixPracticeTarget,
      );
      if (inDocument) {
        remixAnchor = { ...front, capturedAt: Date.now() };
        const selection = (await isSecureInputActive())
          ? null
          : await copySelectionFromFocusedApp().catch(() => null);
        hotkeyLog.info(
          `remix recapture: ${selection ? `${selection.length} chars` : "no selection"} in "${front.appName}"`,
        );
        return {
          selection,
          ...clipboardPreviewFields(),
          ...remixAnchor,
          stale: false,
        };
      }
      hotkeyLog.info("remix recapture: document not in front; keeping anchor");
      return {
        selection: null,
        appName: remixAnchor?.appName ?? null,
        windowTitle: remixAnchor?.windowTitle ?? null,
        url: remixAnchor?.url ?? null,
        ...clipboardPreviewFields(),
        capturedAt: remixAnchor?.capturedAt ?? Date.now(),
        stale: true,
      };
    } finally {
      if (panelYielded) restorePanelFocus();
    }
  });

  if (process.env.FREESTYLE_E2E === "1") {
    ipcMain.handle("e2e:remix-practice-target", () => remixPracticeTarget);
  }

  // Chat card releases digit routes while open.
  ipcMain.on("remix:set-route-keys", (_event, open: unknown) => {
    setRemixRouteKeys(open === true);
  });

  // The pill is retired; accept the legacy channel as a no-op.
  ipcMain.on("remix:set-chat-focus", () => {});
});

interface FrontmostContext {
  appName: string | null;
  windowTitle: string | null;
  url: string | null;
}

async function getFrontmostContext(): Promise<FrontmostContext> {
  try {
    let raw: string | null = null;
    if (process.platform === "darwin") raw = await getMacFrontmostApp();
    else if (process.platform === "win32") raw = await getWindowsFrontmostApp();
    else if (process.platform === "linux") raw = await getLinuxFrontmostApp();
    if (!raw) return { appName: null, windowTitle: null, url: null };
    try {
      const parsed = JSON.parse(raw) as {
        app?: string;
        windowTitle?: string;
        title?: string;
        url?: string;
      };
      return {
        appName: parsed.app?.trim() || null,
        windowTitle: parsed.windowTitle?.trim() || parsed.title?.trim() || null,
        url: parsed.url?.trim() || null,
      };
    } catch {
      return { appName: raw.trim() || null, windowTitle: null, url: null };
    }
  } catch {
    return { appName: null, windowTitle: null, url: null };
  }
}

/** Clipboard preview after selection capture restores what Copy borrowed. */
function clipboardPreviewFields(): {
  clipboard: string | null;
  clipboardLength: number;
} {
  const text = clipboard.readText();
  return {
    clipboard: text ? text.slice(0, REMIX_CLIPBOARD_PREVIEW_LIMIT) : null,
    clipboardLength: text.length,
  };
}

let remixAnchor: {
  appName: string | null;
  windowTitle: string | null;
  url: string | null;
  capturedAt: number;
} | null = null;

const REMIX_ANCHOR_MAX_AGE_MS = 5 * 60 * 1000;

// Remix document access: AX when available, keyboard fallback for canvas editors.

interface AxReadResult {
  text: string;
  selStart: number;
  selLen: number;
  settable: boolean;
}

async function runMacAxRead(): Promise<AxReadResult | null> {
  if (process.platform !== "darwin") return null;
  const binary = getNativeBinaryPath("macos-ax");
  if (!binary) return null;
  try {
    // A large document's JSON easily exceeds execFile's 1MB default buffer.
    const out = await execAsync(binary, ["read"], 3000, 16 * 1024 * 1024);
    return JSON.parse(out) as AxReadResult;
  } catch {
    return null;
  }
}

async function runMacAxSelect(start: number, len: number): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const binary = getNativeBinaryPath("macos-ax");
  if (!binary) return false;
  try {
    await execAsync(binary, ["select", String(start), String(len)], 3000);
    return true;
  } catch {
    return false;
  }
}

async function runMacAxCaps(): Promise<{
  settable: boolean;
  length: number;
} | null> {
  if (process.platform !== "darwin") return null;
  const binary = getNativeBinaryPath("macos-ax");
  if (!binary) return null;
  try {
    const out = await execAsync(binary, ["caps"], 3000);
    return JSON.parse(out) as { settable: boolean; length: number };
  } catch {
    return null;
  }
}

async function isSecureInputActive(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const binary = getNativeBinaryPath("macos-ax");
  if (!binary) return false;
  try {
    return (await execAsync(binary, ["secure"], 1000)) === "1";
  } catch {
    return false;
  }
}

async function runMacAxKey(code: number): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const binary = getNativeBinaryPath("macos-ax");
  if (!binary) return false;
  try {
    await execAsync(binary, ["key", String(code)], 3000);
    return true;
  } catch {
    return false;
  }
}

/** Cmd+A via CGEvent binary (same AX permission as paste); osascript fallback. */
async function sendSelectAllToFocusedApp(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const binary = getNativeBinaryPath("macos-fast-paste");
  if (binary) {
    try {
      await execAsync(binary, ["a"], 3000);
      return true;
    } catch (err) {
      hotkeyLog.warn(`Native select-all failed, trying osascript: ${err}`);
    }
  }
  return runKeystrokeScript(['keystroke "a" using {command down}']);
}

/** Whitelist of bare keycodes press_key may inject (no modifier chords). */
const REMIX_PRESSABLE_KEYS: Record<string, number> = {
  enter: 36,
  tab: 48,
  escape: 53,
  backspace: 51,
  delete: 117,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  home: 115,
  end: 119,
};

async function sendChordToFocusedApp(
  letter: string,
  shift: boolean,
): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const binary = getNativeBinaryPath("macos-fast-paste");
  if (binary) {
    try {
      await execAsync(binary, shift ? [letter, "shift"] : [letter], 3000);
      return true;
    } catch (err) {
      hotkeyLog.warn(`Native chord ${letter} failed, trying osascript: ${err}`);
    }
  }
  return runKeystrokeScript([
    `keystroke "${letter}" using {command down${shift ? ", shift down" : ""}}`,
  ]);
}

async function runKeystrokeScript(lines: string[]): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const script = [
    'tell application "System Events"',
    ...lines,
    "end tell",
  ].flatMap((line) => ["-e", line]);
  try {
    await execAsync("osascript", script, 8000);
    return true;
  } catch (err) {
    hotkeyLog.warn(`Keystroke script failed: ${err}`);
    return false;
  }
}

/**
 * Injected keystrokes land in the KEY window, so any focusable Freestyle
 * window (the pill while typing, the companion panel's composer) must yield
 * before a Copy/Paste or we read/write our own input field.
 *
 * Returns whether the companion panel was the window that yielded, so
 * capture handlers can hand focus back to its composer when they finish.
 * macOS panels can order themselves out on losing key status — if the blur
 * hid the panel, reshow it inactive so the user never sees it vanish.
 */
async function yieldFocusToUserApp(): Promise<boolean> {
  let yielded = false;
  let panelYielded = false;
  for (const win of [mainWindow, panelWindow]) {
    if (win && !win.isDestroyed() && win.isFocused()) {
      win.blur();
      yielded = true;
      if (win === panelWindow) panelYielded = true;
    }
  }
  if (yielded) await wait(140);
  const panel = panelWindow;
  if (panelYielded && panel && !panel.isDestroyed() && !panel.isVisible()) {
    panel.showInactive();
  }
  return panelYielded;
}

/** Hand key focus back to the panel composer after a capture finished. */
function restorePanelFocus(): void {
  const win = panelWindow;
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  win.focus();
  win.webContents.send("panel:focus-composer");
}

/** Yield key focus to the document before injecting; false if it can't. */
async function focusAnchorForInjection(): Promise<boolean> {
  const anchor = remixAnchor;
  if (
    !anchor?.appName ||
    Date.now() - anchor.capturedAt > REMIX_ANCHOR_MAX_AGE_MS
  ) {
    return false;
  }
  if (await isSecureInputActive()) {
    hotkeyLog.warn("Remix injection refused: secure input is active.");
    return false;
  }
  await yieldFocusToUserApp();
  let front = await getFrontmostContext();
  const ours = getFreestyleAppExclusions();
  // Practice mode: don't osascript-activate Freestyle (we're already there).
  if (
    front.appName &&
    !isRemixTargetAllowed(front.appName, ours, remixPracticeTarget)
  ) {
    await activateAnchorApp(anchor.appName);
    front = await getFrontmostContext();
  }
  return front.appName === anchor.appName;
}

/** Keyboard-tier selection via the app's Find (canvas editors). */
const REMIX_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const REMIX_IMAGE_TIMEOUT_MS = 15_000;

async function fetchRemixImage(
  url: string,
): Promise<Electron.NativeImage | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REMIX_IMAGE_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > REMIX_IMAGE_MAX_BYTES) {
      return null;
    }
    const image = nativeImage.createFromBuffer(buffer);
    return image.isEmpty() ? null : image;
  } catch (err) {
    hotkeyLog.warn(`Remix image fetch failed: ${err}`);
    return null;
  }
}

/** Bring the anchored app frontmost (macOS); settle before re-check. */
async function activateAnchorApp(appName: string): Promise<void> {
  if (process.platform !== "darwin") return;
  try {
    await execAsync(
      "osascript",
      ["-e", `tell application ${JSON.stringify(appName)} to activate`],
      2000,
    );
    await wait(150);
  } catch (err) {
    hotkeyLog.warn(`Could not re-activate "${appName}": ${err}`);
  }
}

// Remix bar — bottom-edge sliver; hides while the pill is up.

let companionWindow: BrowserWindow | null = null;
let companionHotRect: PillHotRect | null = null;
let companionLastRect: PillHotRect | null = null;
let companionHotPollTimer: NodeJS.Timeout | null = null;

function companionPosition(display?: Display): { x: number; y: number } {
  const targetDisplay =
    display ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x: waX, y: waY, height } = targetDisplay.workArea;
  const info = SPRITES_INFO[companionFormSetting()];
  // Sheet sprites have transparent margin around the drawn body; the anchor
  // hangs the window off the work area so the BODY touches the corner.
  if (info.anchor) {
    return {
      x: waX + info.anchor.margin - info.anchor.bodyLeft,
      y:
        waY +
        height -
        info.windowSize +
        info.anchor.bodyBottom -
        info.anchor.margin,
    };
  }
  return {
    x: waX,
    y: waY + height - info.windowSize,
  };
}

async function getNativeFocusedWindowBounds(
  binaryName: string,
  args: string[] = [String(process.pid)],
): Promise<WindowBounds | null> {
  const binary = getNativeBinaryPath(binaryName);
  if (!binary) return null;
  try {
    const out = await execAsync(binary, args, 800);
    const bounds = parseWindowBounds(out);
    return bounds?.pid === process.pid ? null : bounds;
  } catch {
    return null;
  }
}

async function getSwayExternalWindowBounds(): Promise<WindowBounds | null> {
  try {
    const out = await execAsync("swaymsg", ["-t", "get_tree"], 800);
    return getSwayFocusedWindowBounds(JSON.parse(out) as SwayNode, process.pid);
  } catch {
    return null;
  }
}

function focusedWindowBoundsToDip(bounds: WindowBounds): WindowBounds {
  if (process.platform === "win32") {
    const rect = screen.screenToDipRect(null, bounds);
    return {
      ...rect,
      ...(bounds.pid === undefined ? {} : { pid: bounds.pid }),
    };
  }
  if (process.platform === "linux" && !isWaylandSession()) {
    const topLeft = screen.screenToDipPoint(bounds);
    const bottomRight = screen.screenToDipPoint({
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
      ...(bounds.pid === undefined ? {} : { pid: bounds.pid }),
    };
  }
  return bounds;
}

async function getFocusedExternalDisplay(): Promise<Display | null> {
  const bounds = await (() => {
    switch (process.platform) {
      case "darwin":
        return getNativeFocusedWindowBounds("macos-ax", [
          "window",
          String(process.pid),
        ]);
      case "win32":
        return getNativeFocusedWindowBounds("windows-window-bounds");
      case "linux":
        return isWaylandSession()
          ? getSwayExternalWindowBounds()
          : getNativeFocusedWindowBounds("linux-window-bounds");
      default:
        return Promise.resolve(null);
    }
  })();
  return bounds
    ? screen.getDisplayMatching(focusedWindowBoundsToDip(bounds))
    : null;
}

const dictationDisplayRequests = createDictationDisplayRequestTracker();

/**
 * Associate the visible companion with the target captured for this dictation
 * session. Cursor is only an immediate fallback; an Accessibility lookup moves
 * it to the external app's display without following later mouse movement.
 */
function anchorCompanionForDictation(): void {
  const win = companionWindow;
  if (!win || win.isDestroyed()) return;

  const request = dictationDisplayRequests.begin();
  const cursorDisplay = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  );
  positionCompanionOnDisplay(resolveCompanionDisplay(null, cursorDisplay));

  void getFocusedExternalDisplay().then((focusedDisplay) => {
    if (!dictationDisplayRequests.isCurrent(request)) return;
    if (!companionWindow || companionWindow.isDestroyed()) return;
    positionCompanionOnDisplay(
      resolveCompanionDisplay(focusedDisplay, cursorDisplay),
    );
  });
}

function positionCompanionOnDisplay(display: Display): void {
  const win = companionWindow;
  if (!win || win.isDestroyed()) return;
  const size = SPRITES_INFO[companionFormSetting()].windowSize;
  const { x, y } = companionPosition(display);
  win.setBounds({ x, y, width: size, height: size });
}

function stopCompanionHotPoll(): void {
  if (!companionHotPollTimer) return;
  clearInterval(companionHotPollTimer);
  companionHotPollTimer = null;
}

function setCompanionHotRect(rect: PillHotRect | null): void {
  if (process.env.FREESTYLE_E2E === "1") return;
  if (rect) companionLastRect = rect;
  companionHotRect = rect;
  const win = companionWindow;
  if (!win || win.isDestroyed()) return;
  if (!rect) {
    stopCompanionHotPoll();
    win.setIgnoreMouseEvents(false);
    return;
  }
  win.setIgnoreMouseEvents(true, { forward: process.platform !== "linux" });
  if (companionHotPollTimer) return;
  companionHotPollTimer = setInterval(() => {
    const w = companionWindow;
    const hot = companionHotRect;
    if (!w || w.isDestroyed() || !hot || !w.isVisible()) return;
    const bounds = w.getBounds();
    const cursor = screen.getCursorScreenPoint();
    const inside =
      cursor.x >= bounds.x + hot.x &&
      cursor.x <= bounds.x + hot.x + hot.width &&
      cursor.y >= bounds.y + hot.y &&
      cursor.y <= bounds.y + hot.y + hot.height;
    if (!inside) return;
    companionHotRect = null;
    stopCompanionHotPoll();
    w.setIgnoreMouseEvents(false);
    w.webContents.send("companion:hot-enter");
  }, 120);
}

function rearmCompanionHotRect(): void {
  if (!companionLastRect) return;
  setCompanionHotRect(companionLastRect);
}

function companionFormSetting(): CompanionForm {
  return parseCompanionForm(readSettings().companionForm as string | undefined);
}

function dictationPrefs(): {
  destination: "cursor" | "composer";
  outputMode: "paste" | "clipboard";
  soundEnabled: boolean;
  audioPlaybackMode: AudioPlaybackMode;
} {
  let destination: "cursor" | "composer" = "cursor";
  let outputMode: "paste" | "clipboard" = "paste";
  let soundEnabled = true;
  let audioPlaybackMode: AudioPlaybackMode = "off";
  try {
    destination = parseDictationDestination(
      readServerSetting(SETTINGS_KEYS.dictationDestination),
    );
    outputMode =
      readServerSetting(SETTINGS_KEYS.outputMode) === "clipboard"
        ? "clipboard"
        : "paste";
    soundEnabled = readServerSetting(SETTINGS_KEYS.soundEnabled) !== "false";
    const mode = readServerSetting("audio_playback_mode");
    if (mode === "duck" || mode === "pause" || mode === "off") {
      audioPlaybackMode = mode;
    }
  } catch {}
  return { destination, outputMode, soundEnabled, audioPlaybackMode };
}

export function broadcastDictationPrefs(): void {
  companionWindow?.webContents.send("dictation:prefs", dictationPrefs());
}

ipcMain.handle("dictation:prefs", () => dictationPrefs());

ipcMain.on("dictation:reload-prefs", () => broadcastDictationPrefs());

ipcMain.handle("companion:form", () => companionFormSetting());

ipcMain.on("companion:set-form", (_event, form: string) => {
  const next = parseCompanionForm(form);
  writeSettings({ companionForm: next });
  const win = companionWindow;
  if (win && !win.isDestroyed()) {
    const size = SPRITES_INFO[next].windowSize;
    const { x, y } = companionPosition();
    win.setBounds({ x, y, width: size, height: size });
    win.webContents.send("companion:form", next);
  }
  // The panel's head badge mirrors the active sprite too.
  panelWindow?.webContents.send("companion:form", next);
});

ipcMain.on("sprite:event", (event, ev: unknown) => {
  if (event.sender !== panelWindow?.webContents) return;
  companionWindow?.webContents.send("companion:sprite-event", ev);
  const travel = ev as { kind?: string; phase?: string };
  if (travel?.kind === "travel") {
    setTravelling(travel.phase === "start");
  }
});

const NOTIFICATION_POLL_MS = 20_000;
let notificationPollTimer: NodeJS.Timeout | null = null;
const notifiedIds = new Set<string>();

interface DesktopNotification {
  id: string;
  origin: "cloud" | "local";
  kind: "thread" | "info";
  title: string;
  body: string;
  createdAt: number;
  seenAt: number | null;
}

async function fetchNotifications(): Promise<DesktopNotification[]> {
  try {
    const res = await fetch(`${getServerBaseUrl()}/api/notifications`, {
      headers: getServerAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      notifications?: DesktopNotification[];
    };
    return data.notifications ?? [];
  } catch {
    return [];
  }
}

async function postNotification(
  path: string,
  body?: unknown,
): Promise<unknown> {
  try {
    const res = await fetch(`${getServerBaseUrl()}/api/notifications${path}`, {
      method: "POST",
      headers: {
        ...getServerAuthHeaders(),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function refreshNotifications(): Promise<void> {
  const items = await fetchNotifications();
  if (items.length === 0) {
    hideNotifications();
    notifyRendererChanged();
    return;
  }

  showNotifications();
  notifyRendererChanged();

  const fresh = items.filter(
    (n) => n.seenAt === null && !notifiedIds.has(n.id),
  );
  if (fresh.length === 0) return;
  for (const item of fresh) {
    notifiedIds.add(item.id);
    if (!Notification.isSupported()) continue;
    const note = new Notification({ title: item.title, body: item.body });
    note.on("click", () => void openNotification(item.id));
    note.show();
  }
  await postNotification("/seen", { ids: fresh.map((n) => n.id) });
}

async function openNotification(id: string): Promise<void> {
  const result = (await postNotification(
    `/${encodeURIComponent(id)}/open`,
  )) as {
    ok?: boolean;
    threadId?: string;
    url?: string;
  } | null;
  await refreshNotifications();
  if (result?.threadId) {
    openPanel({ focusComposer: false });
    panelWindow?.webContents.send("panel:open-thread", result.threadId);
    return;
  }
  if (result?.url) void shell.openExternal(result.url);
}

function startNotificationPoll(): void {
  if (notificationPollTimer) return;
  void refreshNotifications();
  notificationPollTimer = setInterval(
    () => void refreshNotifications(),
    NOTIFICATION_POLL_MS,
  );
  notificationPollTimer.unref();
}

ipcMain.handle("notifications:list", async () => await fetchNotifications());

ipcMain.on("notifications:dismiss", (_event, id: unknown) => {
  if (typeof id !== "string") return;
  void postNotification(`/${encodeURIComponent(id)}/dismiss`).then(() =>
    refreshNotifications(),
  );
});

ipcMain.on("notifications:open", (_event, id: unknown) => {
  if (typeof id !== "string") return;
  void openNotification(id);
});

ipcMain.on("notifications:set-height", (_event, height: unknown) => {
  if (typeof height !== "number") return;
  setNotificationHeight(height);
});

ipcMain.on("agent:turn-finished", (_event, payload: unknown) => {
  const turn = payload as { threadId?: unknown; excerpt?: unknown };
  if (typeof turn?.threadId !== "string" || typeof turn?.excerpt !== "string") {
    return;
  }
  void postNotification("/refresh");
  if (panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) {
    return;
  }
  void postNotification("", {
    kind: "thread",
    title: `${SPRITES_INFO[companionFormSetting()].label} finished`,
    body: turn.excerpt.slice(0, 140),
    threadId: turn.threadId,
  }).then(() => refreshNotifications());
});

initSpriteTravel({
  getWindow: () => companionWindow,
  windowSize: () => SPRITES_INFO[companionFormSetting()].windowSize,
  homePosition: () => companionPosition(),
  theaterAvailable: () => SPRITES_INFO[companionFormSetting()].kind === "sheet",
  travelEnabled: () => SPRITES_INFO[companionFormSetting()].travel === true,
  sendEvent: (ev) =>
    companionWindow?.webContents.send("companion:sprite-event", ev),
});

ipcMain.handle("sprite:perform-sync", (event, payload: unknown) => {
  if (event.sender !== panelWindow?.webContents) return false;
  return performSyncAction(payload as { name: string; toolClass: string });
});

ipcMain.on("sprite:impact", (event, nonce: string) => {
  if (event.sender !== companionWindow?.webContents) return;
  resolveSpriteImpact(nonce);
});

ipcMain.on("sprite:perform-done", (event, nonce: string) => {
  if (event.sender !== companionWindow?.webContents) return;
  resolveSpritePerformDone(nonce);
});

ipcMain.on("companion:set-hot-rect", (event, rect: PillHotRect | null) => {
  if (event.sender !== companionWindow?.webContents) return;
  setCompanionHotRect(rect);
});

ipcMain.on("companion:hover", (event) => {
  if (event.sender !== companionWindow?.webContents) return;
  openPanel();
});

let pendingDictation: { kind: string; text: string } | null = null;

function forwardDictation(
  kind: "partial" | "final" | "error",
  text: string,
): void {
  const win = panelWindow;
  if (!win || win.isDestroyed()) return;
  if (win.webContents.isLoading()) {
    pendingDictation = { kind, text };
    win.webContents.once("did-finish-load", () => {
      if (!pendingDictation) return;
      win.webContents.send("panel:dictation", pendingDictation);
      pendingDictation = null;
    });
    return;
  }
  win.webContents.send("panel:dictation", { kind, text });
}

ipcMain.on("panel:open-for-dictation", (event) => {
  if (event.sender !== companionWindow?.webContents) return;
  openPanel({ focusComposer: true });
});

ipcMain.on("panel:dictation-partial", (event, text: string) => {
  if (event.sender !== companionWindow?.webContents) return;
  forwardDictation("partial", text);
});

ipcMain.on("panel:dictation-final", (event, text: string) => {
  if (event.sender !== companionWindow?.webContents) return;
  forwardDictation("final", text);
});

ipcMain.on("panel:dictation-error", (event, message: string) => {
  if (event.sender !== companionWindow?.webContents) return;
  forwardDictation("error", message);
});

ipcMain.on("panel:close", (event) => {
  if (event.sender !== panelWindow?.webContents) return;
  closePanel();
});

ipcMain.on("panel:pointer-left", (event) => {
  if (event.sender !== panelWindow?.webContents) return;
  schedulePanelHide();
});

ipcMain.on("panel:pointer-entered", (event) => {
  if (event.sender !== panelWindow?.webContents) return;
  cancelPanelHide();
});

// The renderer pins the panel while a turn is running or an approval card is
// up: no hover-out hide, no blur-triggered hide, so the agent yielding key
// focus to capture the user's document can't dismiss the panel mid-turn.
ipcMain.on("panel:set-busy", (event, busy: unknown) => {
  if (event.sender !== panelWindow?.webContents) return;
  const next = busy === true;
  // The corner sprite mirrors the agent loop: this is what puts Jeb at his
  // laptop (and Spark into its breathing state) while a turn runs.
  if (next !== panelBusy) setCompanionState(next ? "working" : "idle");
  panelBusy = next;
  if (panelBusy) cancelPanelHide();
});

// Clicking into the composer after an agent tool yielded key focus: panel
// windows don't always take key back from a content click on macOS, so the
// renderer asks for it explicitly.
ipcMain.on("panel:request-focus", (event) => {
  if (event.sender !== panelWindow?.webContents) return;
  const win = panelWindow;
  if (win && !win.isDestroyed() && win.isVisible() && !win.isFocused()) {
    win.focus();
  }
});

let panelWindow: BrowserWindow | null = null;
let panelHideTimer: NodeJS.Timeout | null = null;
let panelBusy = false;
const PANEL_HIDE_GRACE_MS = 420;
const PANEL_HOVER_PAD = 24;

function panelPosition(display: Display): {
  x: number;
  y: number;
  height: number;
} {
  const { x: waX, y: waY, width, height } = display.workArea;
  const x = Math.min(waX + 16, waX + Math.max(0, width - PANEL_WIDTH - 16));
  const available = height - COMPANION_CLEARANCE - PANEL_GAP;
  const panelHeight = Math.max(320, Math.min(PANEL_HEIGHT, available));
  const y = Math.max(waY, waY + height - COMPANION_CLEARANCE - panelHeight);
  return { x, y, height: panelHeight };
}

function createPanelWindow(): void {
  if (panelWindow && !panelWindow.isDestroyed()) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, height } = panelPosition(display);

  panelWindow = new BrowserWindow({
    width: PANEL_WIDTH,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    focusable: true,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  panelWindow.setAlwaysOnTop(true, "screen-saver");
  panelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  panelWindow.on("closed", () => {
    panelWindow = null;
  });
  // Losing focus is the only signal that "hover off then hide" can rely on
  // once the composer has been clicked: pointer-leave alone is ignored while
  // the panel is focused, so re-check on blur. Agent tool calls blur the
  // panel deliberately mid-turn — panelBusy suppresses those.
  panelWindow.on("blur", () => {
    if (!panelBusy) schedulePanelHide();
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void panelWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/panel.html`);
  } else {
    void panelWindow.loadFile(join(__dirname, "../renderer/panel.html"));
  }
}

function cancelPanelHide(): void {
  if (!panelHideTimer) return;
  clearTimeout(panelHideTimer);
  panelHideTimer = null;
}

function openPanel(opts: { focusComposer?: boolean } = {}): void {
  cancelPanelHide();
  createPanelWindow();
  const win = panelWindow;
  if (!win || win.isDestroyed()) return;
  invalidateDictationDisplayRequest(dictationDisplayRequests);
  const cursorDisplay = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  );
  const { panelDisplay, companionDisplay } =
    resolvePanelCompanionDisplays(cursorDisplay);
  const { x, y, height } = panelPosition(panelDisplay);
  win.setBounds({ x, y, width: PANEL_WIDTH, height });
  positionCompanionOnDisplay(companionDisplay);
  if (opts.focusComposer) {
    win.show();
    win.focus();
    win.webContents.send("panel:focus-composer");
  } else {
    win.showInactive();
  }
}

function closePanel(): void {
  cancelPanelHide();
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.hide();
  rearmCompanionHotRect();
}

function cursorWithin(win: BrowserWindow | null, pad = 0): boolean {
  if (!win || win.isDestroyed()) return false;
  const b = win.getBounds();
  const c = screen.getCursorScreenPoint();
  return (
    c.x >= b.x - pad &&
    c.x <= b.x + b.width + pad &&
    c.y >= b.y - pad &&
    c.y <= b.y + b.height + pad
  );
}

function schedulePanelHide(): void {
  cancelPanelHide();
  panelHideTimer = setTimeout(() => {
    panelHideTimer = null;
    const win = panelWindow;
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    if (panelBusy) return;
    if (win.isFocused()) return;
    // A pointer heading for the companion, or hovering the gap between the two,
    // is not a pointer leaving — only hide when it is clear of both.
    if (cursorWithin(win, PANEL_HOVER_PAD)) return;
    if (cursorWithin(companionWindow, PANEL_HOVER_PAD)) return;
    win.hide();
    rearmCompanionHotRect();
  }, PANEL_HIDE_GRACE_MS);
}

const SUMMON_ACCELERATOR = "Alt+Space";

function registerSummonShortcut(): void {
  try {
    if (globalShortcut.isRegistered(SUMMON_ACCELERATOR)) {
      globalShortcut.unregister(SUMMON_ACCELERATOR);
    }
    const ok = globalShortcut.register(SUMMON_ACCELERATOR, () => {
      const visible = panelWindow?.isVisible() && !panelWindow.isDestroyed();
      if (visible) closePanel();
      else openPanel({ focusComposer: true });
    });
    if (!ok)
      log.warn(`Could not register summon shortcut ${SUMMON_ACCELERATOR}`);
  } catch (err) {
    log.warn(`Summon shortcut registration failed: ${err}`);
  }
}

function destroyPanelWindow(): void {
  cancelPanelHide();
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.destroy();
  panelWindow = null;
}

function createCompanionWindow(): void {
  if (companionWindow && !companionWindow.isDestroyed()) return;
  const size = SPRITES_INFO[companionFormSetting()].windowSize;
  const { x, y } = companionPosition();

  companionWindow = new BrowserWindow({
    width: size,
    height: size,
    x,
    y,
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
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  companionWindow.setAlwaysOnTop(true, "screen-saver");
  companionWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });
  companionWindow.setIgnoreMouseEvents(true, {
    forward: process.platform !== "linux",
  });

  companionWindow.on("closed", () => {
    stopCompanionHotPoll();
    companionWindow = null;
  });

  companionWindow.once("ready-to-show", () => {
    companionWindow?.showInactive();
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void companionWindow.loadURL(
      `${process.env.ELECTRON_RENDERER_URL}/companion.html`,
    );
  } else {
    void companionWindow.loadFile(
      join(__dirname, "../renderer/companion.html"),
    );
  }
}

function destroyCompanionWindow(): void {
  stopCompanionHotPoll();
  if (companionWindow && !companionWindow.isDestroyed()) {
    companionWindow.destroy();
  }
  companionWindow = null;
}

export function setCompanionState(state: CompanionState): void {
  companionWindow?.webContents.send("companion:state", state);
}

// The remix bar is retired with the pill. Call sites that used to
// reposition or toggle it remain; there is nothing left to update.
function updateRemixBar(): void {}

function applyRemixSettings(settings: Record<string, string>): void {
  remixInitialized = true;
  const configured = settings[SETTINGS_KEYS.remixHotkey];
  scheduleRemixHotkeyRegistration(
    configured && isValidAccelerator(configured) ? configured : undefined,
  );
}

const DEFAULT_HOTKEY = getDefaultHotkey();
const HOTKEY_MODIFIER_PARTS = new Set([
  "alt",
  "option",
  "control",
  "ctrl",
  "command",
  "cmd",
  "commandorcontrol",
  "cmdorctrl",
  "shift",
  "super",
  "meta",
  "win",
  "fn",
  "globe",
  "rightalt",
  "rightoption",
  "rightcontrol",
  "rightctrl",
  "rightshift",
  "rightcommand",
  "rightcmd",
  "rightsuper",
  "rightwin",
  "rightmeta",
]);
const HOTKEY_MACRO_MOUSE_PARTS = new Set(["mousebutton4", "mousebutton5"]);

function isValidAccelerator(accel: string): boolean {
  if (!accel || typeof accel !== "string") return false;
  if (!/^[\x20-\x7E]+$/.test(accel)) return false;
  if (accel.endsWith("+")) return false;
  const parts = accel.split("+");
  if (parts.some((p) => !p.trim())) return false;
  const lowered = parts.map((p) => p.trim().toLowerCase());
  // Fn/Globe is only observable by the macOS native listener; on other
  // platforms a hotkey containing it would silently never fire.
  if (
    process.platform !== "darwin" &&
    lowered.some((p) => p === "fn" || p === "globe")
  ) {
    return false;
  }
  return lowered.some(
    (part) =>
      HOTKEY_MODIFIER_PARTS.has(part) || HOTKEY_MACRO_MOUSE_PARTS.has(part),
  );
}

/** The configured hotkey accelerator from a settings map, if valid. */
function hotkeyFromSettings(
  settings: Record<string, string>,
): string | undefined {
  const value = settings[SETTINGS_KEYS.hotkey];
  return value && isValidAccelerator(value) ? value : undefined;
}

/** The hotkey activation mode from a settings map (defaults to "hold"). */
function hotkeyModeFromSettings(
  settings: Record<string, string>,
): "hold" | "toggle" {
  return settings[SETTINGS_KEYS.hotkeyMode] === "toggle" ? "toggle" : "hold";
}

function dictationTargets(): BrowserWindow[] {
  // The companion is the ONLY window that records and delivers dictation.
  // The settings window receives the events too, but purely for the
  // onboarding/tutorial visuals — it has no recording pipeline.
  const targets: BrowserWindow[] = [];
  if (companionWindow && !companionWindow.isDestroyed())
    targets.push(companionWindow);
  return targets;
}

function sendHotkeyDown(): void {
  const missingPermission = getMissingDictationPermission();
  if (missingPermission) {
    hotkeyPressed = false;
    clearHotkeyStuckWatchdog();
    void showRequiredPermissionDialog(missingPermission);
    return;
  }
  anchorCompanionForDictation();
  relayServerEvent({ type: FreestyleEventType.RecordingStarted });
  for (const win of dictationTargets()) {
    win.webContents.send("hotkey:down");
  }
}

function sendHotkeyUp(): void {
  for (const win of dictationTargets()) {
    win.webContents.send("hotkey:up");
  }
}

let remixStuckTimer: NodeJS.Timeout | null = null;

function clearRemixStuckWatchdog(): void {
  if (remixStuckTimer) {
    clearTimeout(remixStuckTimer);
    remixStuckTimer = null;
  }
}

/** Remix chord + digit routes; claimed while the card is up. Spell modifiers
 *  (Control is physically down); Fn isn't expressible as an accelerator. */
const REMIX_ROUTE_MODIFIER =
  process.platform === "darwin" ? "Control" : "Control+Alt";
const REMIX_ROUTE_DIGITS = ["1", "2", "3"];
let remixRouteKeysHeld = false;

function setRemixRouteKeys(open: boolean): void {
  if (open === remixRouteKeysHeld) return;
  remixRouteKeysHeld = open;

  for (const [index, digit] of REMIX_ROUTE_DIGITS.entries()) {
    const accel = `${REMIX_ROUTE_MODIFIER}+${digit}`;
    if (!open) {
      try {
        globalShortcut.unregister(accel);
      } catch {}
      continue;
    }
    try {
      const claimed = globalShortcut.register(accel, () => {
        if (mainWindow?.isVisible()) {
          mainWindow.webContents.send("remix:route", index);
        }
      });
      // Log when the OS already owns the chord.
      if (!claimed) {
        hotkeyLog.warn(`Route shortcut "${accel}" is already taken.`);
      }
    } catch (err) {
      hotkeyLog.warn(`Could not claim "${accel}" for a remix route: ${err}`);
    }
  }
}

function scheduleRemixHotkeyRegistration(hotkey?: string): void {
  void registerRemixHotkey(hotkey).catch((err) => {
    hotkeyLog.error(
      `Remix hotkey registration failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}

/** Start the remix native listener. No globalShortcut fallback (needs hold/tap). */
/**
 * The talk key went down: start listening into the Tavern. The panel itself
 * opens on release, when the transcript lands — while holding, the listening
 * HUD is the only surface.
 *
 * Fn+Control shares Fn with dictation, so a slow chord press starts a rogue
 * cursor-dictation first; supersede it — the renderer cancels that session
 * and restarts as a talk session, and clearing hotkeyPressed here keeps the
 * later Fn release from double-finishing it.
 */
function handleTavernTalkDown(): void {
  if (hotkeyPressed) {
    hotkeyPressed = false;
    clearHotkeyStuckWatchdog();
  }
  const win = companionWindow;
  if (win && !win.isDestroyed()) win.webContents.send("talk:down");
}

function handleTavernTalkUp(): void {
  const win = companionWindow;
  if (win && !win.isDestroyed()) win.webContents.send("talk:up");
}

/**
 * The old Remix hotkey, rebound: hold it to summon the Tavern panel with
 * dictation streaming straight into the composer, release to finish. Same
 * setting key, same default chord (Fn+Control on macOS), new destination.
 */
async function registerRemixHotkey(hotkey?: string): Promise<void> {
  if (remixKeyListener) {
    remixKeyListener.stop();
    remixKeyListener = null;
  }

  remixHotkeyPreference = hotkey ?? remixHotkeyPreference;
  const configured = hotkey ?? remixHotkeyPreference;
  const normalized =
    configured && isValidAccelerator(configured)
      ? normalizeAccelerator(configured)
      : null;
  const accel = normalized ?? getDefaultRemixHotkey();

  // Dictation wins on chord clash; the talk key stays off until Settings
  // resolves it.
  if (currentHotkeyAccel && accel === currentHotkeyAccel) {
    hotkeyLog.warn(
      `Talk hotkey "${accel}" is already the dictation hotkey; talk key disabled.`,
    );
    return;
  }

  const listener = new NativeKeyListener({
    hotkey: accel,
    onKeyDown: handleTavernTalkDown,
    onKeyUp: handleTavernTalkUp,
    onError: (error) => {
      hotkeyLog.error(`Talk key listener error: ${error}`);
    },
    onReady: () => {
      hotkeyLog.debug(`Talk key listener ready for "${accel}"`);
    },
    onPermanentFailure: () => {
      if (remixKeyListener !== listener) return;
      hotkeyLog.error("Talk key listener permanently failed; talk key off.");
      listener.stop();
      remixKeyListener = null;
    },
  });
  remixKeyListener = listener;
  const started = await listener.start();
  if (!started) {
    hotkeyLog.warn(`Talk key listener did not start for "${accel}"`);
    if (remixKeyListener === listener) remixKeyListener = null;
  }
}

const HOTKEY_STUCK_TIMEOUT_MS = 5 * 60 * 1000;
let hotkeyStuckTimer: NodeJS.Timeout | null = null;

function clearHotkeyStuckWatchdog(): void {
  if (hotkeyStuckTimer) {
    clearTimeout(hotkeyStuckTimer);
    hotkeyStuckTimer = null;
  }
}

function armHotkeyStuckWatchdog(): void {
  clearHotkeyStuckWatchdog();
  hotkeyStuckTimer = setTimeout(() => {
    hotkeyStuckTimer = null;
    if (!hotkeyPressed) return;
    hotkeyLog.warn(
      "Hold-mode hotkey saw no key-up for 5 minutes; forcing release.",
    );
    hotkeyPressed = false;
    sendHotkeyUp();
  }, HOTKEY_STUCK_TIMEOUT_MS);
}

function handleNativeHotkeyDown(): void {
  if (hotkeyActivationMode === "toggle") {
    if (!hotkeyPressed) {
      hotkeyPressed = true;
      sendHotkeyDown();
    } else {
      hotkeyPressed = false;
      sendHotkeyUp();
    }
    return;
  }

  if (!hotkeyPressed) {
    hotkeyPressed = true;
    armHotkeyStuckWatchdog();
    sendHotkeyDown();
  }
}

function handleNativeHotkeyUp(): void {
  if (hotkeyActivationMode === "toggle") return;

  if (hotkeyPressed) {
    hotkeyPressed = false;
    clearHotkeyStuckWatchdog();
    sendHotkeyUp();
  }
}

// Notify once per session when hold-to-talk degrades to toggle mode, so the
// user isn't left wondering why holding the hotkey stopped working.
let hotkeyDegradedNotified = false;
function notifyHotkeyDegraded(accel: string, nativeError: string): void {
  if (hotkeyDegradedNotified || hotkeyActivationMode !== "hold") return;
  hotkeyDegradedNotified = true;
  let fix = "";
  if (
    process.platform === "linux" &&
    nativeError.includes("No accessible input devices")
  ) {
    fix =
      " To enable hold-to-talk, run: sudo usermod -aG input $USER — then log out and back in.";
  }
  const body = `Hold-to-talk isn't available, so "${accel}" now toggles recording on and off.${fix}`;
  hotkeyLog.warn(body);
  if (Notification.isSupported()) {
    new Notification({ title: "Freestyle is in toggle mode", body }).show();
  }
}

// Rate-limited so a broken paste backend doesn't fire a notification per
// dictation.
const PASTE_FAILED_NOTIFY_INTERVAL_MS = 30_000;
let lastPasteFailedNotifyAt = 0;
function notifyPasteFailed(): void {
  const now = Date.now();
  if (now - lastPasteFailedNotifyAt < PASTE_FAILED_NOTIFY_INTERVAL_MS) return;
  lastPasteFailedNotifyAt = now;
  const shortcut = process.platform === "darwin" ? "Cmd+V" : "Ctrl+V";
  let hint = "";
  if (process.platform === "linux") {
    if (isWaylandSession()) {
      const desktop = (process.env.XDG_CURRENT_DESKTOP ?? "").toLowerCase();
      hint = desktop.includes("gnome")
        ? " If a permission dialog appears on the next paste, allow Freestyle to control input."
        : " If a permission dialog appears on the next paste, allow it — or install wtype (e.g. sudo apt install wtype).";
    } else {
      hint =
        " Installing xdotool may fix this (e.g. sudo apt install xdotool).";
    }
  }
  if (Notification.isSupported()) {
    new Notification({
      title: "Freestyle couldn't paste",
      body: `Your transcript is on the clipboard — press ${shortcut} to paste it.${hint}`,
    }).show();
  }
}

/** Electron globalShortcut rejects some combos (e.g. Alt+Super on Linux). */
const LINUX_GLOBAL_SHORTCUT_FALLBACK = "F9";

function registerGlobalShortcutToggle(accel: string): string | null {
  const onToggle = (): void => {
    if (!hotkeyPressed) {
      hotkeyPressed = true;
      sendHotkeyDown();
    } else {
      hotkeyPressed = false;
      sendHotkeyUp();
    }
  };

  const candidates =
    process.platform === "linux" && /super/i.test(accel)
      ? [accel, LINUX_GLOBAL_SHORTCUT_FALLBACK]
      : [accel];

  for (const candidate of candidates) {
    try {
      if (globalShortcut.register(candidate, onToggle)) {
        if (candidate !== accel) {
          hotkeyLog.warn(
            `globalShortcut does not support "${accel}"; using "${candidate}" instead.`,
          );
        }
        return candidate;
      }
    } catch (err) {
      hotkeyLog.warn(
        `globalShortcut.register failed for "${candidate}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return null;
}

function scheduleHotkeyRegistration(hotkey?: string): void {
  void registerHotkey(hotkey).catch((err) => {
    hotkeyLog.error(
      `Hotkey registration failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}

async function registerHotkey(hotkey?: string): Promise<void> {
  try {
    // Tear down previous listener
    if (keyListener) {
      keyListener.stop();
      keyListener = null;
    }
    hotkeyPressed = false;
    clearHotkeyStuckWatchdog();
    globalShortcut.unregisterAll();

    if (!hotkey) {
      // Unreachable server yields no map; registration falls back to the
      // default accelerator below.
      hotkey = hotkeyFromSettings((await getServerSettings()) ?? {});
    }

    const normalized =
      hotkey && isValidAccelerator(hotkey)
        ? normalizeAccelerator(hotkey)
        : null;
    const accel = normalized ?? DEFAULT_HOTKEY;
    currentHotkeyAccel = accel;

    // Try native key listener binary first (all platforms)
    let nativeError = "";
    const listener = new NativeKeyListener({
      hotkey: accel,
      onKeyDown: handleNativeHotkeyDown,
      onKeyUp: handleNativeHotkeyUp,
      onError: (error) => {
        nativeError = error;
        hotkeyLog.error(`Native key listener error: ${error}`);
      },
      onReady: () => {
        hotkeyLog.debug(`Native key listener ready for "${accel}"`);
      },
      onPermanentFailure: () => {
        if (keyListener !== listener) return;
        hotkeyLog.error(
          "Native key listener permanently failed; falling back to Electron globalShortcut (toggle mode).",
        );
        listener.stop();
        keyListener = null;
        if (hotkeyPressed) {
          hotkeyPressed = false;
          clearHotkeyStuckWatchdog();
          sendHotkeyUp();
        }
        const registeredAccel = registerGlobalShortcutToggle(accel);
        if (registeredAccel) {
          notifyHotkeyDegraded(accel, nativeError);
        } else {
          const errorPayload = {
            message: `The hotkey listener stopped working and "${accel}" could not be re-registered. Restart Freestyle or pick a different combination in Settings.`,
          };
          panelWindow?.webContents.send("hotkey:error", errorPayload);
        }
      },
    });
    keyListener = listener;

    const started = await listener.start();

    // Another registerHotkey call may have replaced keyListener while we
    // were awaiting — if so, abandon this attempt.
    if (keyListener !== listener) {
      listener.stop();
      return;
    }

    if (started) {
      accessibilityConfirmed = true;
      hotkeyDegradedNotified = false;
      // Dictation hotkey moved — re-resolve remix (may free or steal a chord).
      if (remixInitialized) scheduleRemixHotkeyRegistration();
    } else {
      hotkeyLog.warn(
        "Native key listener unavailable, falling back to Electron globalShortcut (toggle mode).",
      );
      listener.stop();
      keyListener = null;

      // Fallback: globalShortcut has no key-up — always use toggle semantics
      const registeredAccel = registerGlobalShortcutToggle(accel);
      if (registeredAccel) {
        // Do NOT latch accessibilityConfirmed here. Registering a global
        // shortcut requires no Accessibility permission on macOS, so a
        // successful registration proves nothing about whether the app can
        // post CGEvents / send Apple Events. Latching it here would make
        // permissions:check-accessibility report a false positive, hide the
        // "grant Accessibility" prompt during onboarding, and leave paste
        // silently broken in the notarized prod build. Only the native key
        // listener starting (above) is real proof of Accessibility.
        notifyHotkeyDegraded(accel, nativeError);
      } else {
        let message = `Could not register hotkey "${accel}". Try a different key combination in Settings.`;
        if (
          process.platform === "linux" &&
          nativeError.includes("No accessible input devices")
        ) {
          message = `Hotkey "${accel}" requires access to input devices. Run: sudo usermod -aG input $USER — then log out and back in.`;
        }
        const errorPayload = { message };
        panelWindow?.webContents.send("hotkey:error", errorPayload);
      }
    }
  } catch (err) {
    hotkeyLog.error(
      `registerHotkey failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// Clean up key listener and mic listener on quit
app.on("will-quit", () => {
  audioPlaybackController.restoreSync();
  stopLinuxPasteHelper();
  destroyCompanionWindow();
  destroyPanelWindow();
  if (keyListener) {
    keyListener.stop();
    keyListener = null;
  }
  if (remixKeyListener) {
    remixKeyListener.stop();
    remixKeyListener = null;
  }
  if (micListener) {
    micListener.stop();
    micListener = null;
  }
  globalShortcut.unregisterAll();
});

// Keep app running in background when windows are closed (tray stays active)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // On non-macOS, keep the app alive for the tray
    // Only quit explicitly via tray menu
  }
});

// Re-open the dashboard when the app is activated (e.g. clicking the dock
// icon or relaunching) and no dashboard window is currently open.
app.on("activate", () => {
  openPanel({ focusComposer: true });
});

// Gracefully shut down the HTTP server and flush Sentry before quitting
let isUpdaterQuitting = false;
let isQuitting = false;

let updateDownloadState: "idle" | "downloading" | "downloaded" = "idle";

function cleanupBeforeQuit(): void {
  // No app-host plugin registry to dispose anymore — every hook (including
  // `dispose`) runs server-side, and the server has its own shutdown path.
  void disposeServerPlugins().catch(() => {});
  audioPlaybackController.restoreSync();
  stopLinuxPasteHelper();
  if (keyListener) {
    keyListener.stop();
    keyListener = null;
  }
  if (micListener) {
    micListener.stop();
    micListener = null;
  }
  stopHotkeyRecorderProcess();
  globalShortcut.unregisterAll();
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

app.on("before-quit", (event) => {
  if (isUpdaterQuitting) {
    try {
      cleanupBeforeQuit();
    } catch (err) {
      log.warn(
        `cleanup before updater quit failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return;
  }
  if (isQuitting) return;
  isQuitting = true;
  event.preventDefault();
  // We preventDefault above, so `app.exit(0)` is the only thing that ends the
  // process. Keep it in a `finally` — if any cleanup step throws (a native
  // listener already torn down, a dead child process), the app would otherwise
  // stay alive forever with no windows, which is what a hung quit looks like.
  try {
    cleanupBeforeQuit();
  } catch (err) {
    log.warn(
      `cleanup before quit failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    app.exit(0);
  }
});
