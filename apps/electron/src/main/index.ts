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
  activateManagedMlxRuntimeForAppVersion,
  autoStartWhisperServer,
  captureException,
  closeDb,
  disposeServerPlugins,
  prefetchManagedMlxRuntimeForAppRelease,
  reconcileUnsupportedMlxVoiceDefault,
  shutdownPosthog,
  startServer as startFreestyleServer,
  stopMlxServer,
  stopWhisperServer,
} from "@freestyle-voice/server";
import { createAppLogger, enableFileLogging } from "@freestyle-voice/utils";
import {
  app,
  BrowserWindow,
  clipboard,
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
  Tray,
} from "electron";
import { autoUpdater } from "electron-updater";
import icon from "../../resources/icon.png?asset";
import trayIconPath from "../../resources/tray/logoTemplate.png?asset";
import { isActiveAudioPlaybackMode } from "../shared/audio-playback";
import { getDefaultHotkey } from "../shared/hotkey-defaults";
import { SETTINGS_KEYS } from "../shared/settings-keys";
import { AudioPlaybackController } from "./audio-control/controller";
import { HotkeyRecorder } from "./hotkey-recorder";
import { normalizeAccelerator } from "./hotkey-utils";
import { NativeKeyListener } from "./key-listener";
import * as linuxAutostart from "./linux-autostart";
import { checkLinuxSetup } from "./linux-setup";
import { MicListener } from "./mic-listener";
import {
  isWaylandSession,
  pasteIntoFocusedApp,
  startLinuxPasteHelper,
  stopLinuxPasteHelper,
} from "./paste";
import {
  plugins as appPlugins,
  FreestyleEventType,
  fetchCatalog,
  fetchPluginSettings,
  initAppPlugins,
  installPlugin,
  OutputMode,
  PipelineStage,
  parseAppContext,
  reloadAppPlugins,
  setPluginEnabled,
  uninstallPlugin,
} from "./plugins/index";
import {
  initPluginUiHost,
  PLUGIN_SCHEME_PRIVILEGE,
  refreshPluginUi,
} from "./plugins/ui-host";
import type { BridgeConfig } from "./plugins/view-manager";

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
const APP_WIDTH = 260;
const APP_HEIGHT = 90;

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
 * Base URL the app uses to reach the locally-run Freestyle server on the
 * resolved port. The DB lives behind the server, so all server-owned data
 * (settings, plugins) is read through it.
 */
function getServerBaseUrl(): string {
  return `http://127.0.0.1:${serverPort}`;
}

/**
 * Load the app-host plugin registry, reading the `plugins` list and plugin
 * settings from the server over HTTP. Called once the server is reachable; the
 * underlying init is idempotent, so repeated calls are harmless.
 */
function initPluginsForServer(): void {
  void initAppPlugins(getServerTarget());
  // Refresh UI plugin discovery now that the server (and `plugins` setting) is
  // reachable. No-op if the settings window hasn't been created yet.
  void getPluginDiscoverySources().then(
    ({ pluginsSetting, userDataDir, disabledPlugins }) =>
      refreshPluginUi(pluginsSetting, userDataDir, disabledPlugins),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let httpServer: any = null;
let serverPort = DEFAULT_PORT;
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let keyListener: NativeKeyListener | null = null;
// Latching flag: set only once the native key listener has started
// successfully, which requires Accessibility permission and therefore
// proves it is granted. NOT set on the globalShortcut fallback, which
// needs no permission and would otherwise produce a false positive. The
// flag persists even when keyListener is temporarily torn down for hotkey
// recording.
let accessibilityConfirmed = false;
let hotkeyPressed = false;
let currentHotkeyAccel: string | null = null;
let hotkeyActivationMode: "hold" | "toggle" = "hold";
let micListener: MicListener | null = null;
let hotkeyRecorder: HotkeyRecorder | null = null;
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
    },
  },
  PLUGIN_SCHEME_PRIVILEGE,
]);

function registerAppProtocol(): void {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let filePath = join(
      __dirname,
      "../renderer",
      decodeURIComponent(url.pathname),
    );

    // If the path has no file extension, serve the dashboard SPA fallback.
    // pill.html is loaded directly by its full path and doesn't need a fallback.
    if (!filePath.match(/\.\w+$/)) {
      filePath = join(__dirname, "../renderer/index.html");
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function getPillURL(): string {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/pill.html`;
  }
  return "app://renderer/pill.html";
}

function getDashboardURL(path = "/"): string {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}${path}`;
  }
  return `app://renderer${path}`;
}

// Tracks the exact coordinates of the last programmatic setPosition call.
// The move listener compares reported coords against this target and ignores
// matching events, eliminating the fixed-timeout race condition.
let programmaticTarget: { x: number; y: number } | null = null;
let programmaticCleanupTimer: NodeJS.Timeout | null = null;

function markProgrammaticTarget(x: number, y: number): void {
  programmaticTarget = { x, y };
  if (programmaticCleanupTimer) clearTimeout(programmaticCleanupTimer);
  // Safety: clear the target after 1s in case the OS never delivers a settle event.
  programmaticCleanupTimer = setTimeout(() => {
    programmaticTarget = null;
    programmaticCleanupTimer = null;
  }, 1000);
}

function setProgrammaticPosition(
  win: BrowserWindow,
  x: number,
  y: number,
): void {
  markProgrammaticTarget(x, y);
  win.setPosition(x, y);
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

// Preset positions follow the display under the cursor so the pill appears
// on whichever monitor the user is working on. Custom positions can be on
// any display — they are saved as absolute screen coordinates and
// bounds-checked on restore.
function getAppWindowPosition(): { x: number; y: number } {
  // Anchor preset positions to the display containing the cursor rather than
  // the primary display, so multi-monitor users see the pill where they are.
  const activeDisplay = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  );
  const { x: waX, y: waY, width, height } = activeDisplay.workArea;

  // Read pill position preference
  const position = (readSettings().pillPosition as string) || "bottom-center";

  // The pill is aligned inside the window via CSS (justify-center or
  // justify-end). Push bottom positions 10px past the work area edge
  // so the pill sits closer to the dock/taskbar.
  const bottomOverlap = 14;
  const topOverlap = 0;
  switch (position) {
    case "top-center":
      return {
        x: waX + Math.round((width - APP_WIDTH) / 2),
        y: waY + topOverlap,
      };
    case "top-right":
      return { x: waX + width - APP_WIDTH, y: waY + topOverlap };
    case "bottom-right":
      return {
        x: waX + width - APP_WIDTH,
        y: waY + height - APP_HEIGHT + bottomOverlap,
      };
    case "custom": {
      const custom = readSettings().pillCustomPosition as
        | { x: number; y: number }
        | undefined;
      if (
        custom &&
        typeof custom.x === "number" &&
        typeof custom.y === "number"
      ) {
        const display = screen.getDisplayMatching({
          x: custom.x,
          y: custom.y,
          width: APP_WIDTH,
          height: APP_HEIGHT,
        });
        const wa = display.workArea;
        if (
          custom.x >= wa.x &&
          custom.x + APP_WIDTH <= wa.x + wa.width &&
          custom.y >= wa.y &&
          custom.y <= wa.y + wa.height
        ) {
          return custom;
        }
        // Saved position is off-screen; reset to default.
        writeSettings({
          pillPosition: "bottom-center",
          pillCustomPosition: undefined,
        });
      }
      return {
        x: waX + Math.round((width - APP_WIDTH) / 2),
        y: waY + height - APP_HEIGHT + bottomOverlap,
      };
    }
    default:
      return {
        x: waX + Math.round((width - APP_WIDTH) / 2),
        y: waY + height - APP_HEIGHT + bottomOverlap,
      };
  }
}

function createAppWindow(): void {
  const { x, y } = getAppWindowPosition();

  // Mark the initial position as programmatic so the move listener ignores it.
  markProgrammaticTarget(x, y);

  mainWindow = new BrowserWindow({
    width: APP_WIDTH,
    height: APP_HEIGHT,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    roundedCorners: true,
    autoHideMenuBar: true,
    focusable: false,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  let moveTimeout: NodeJS.Timeout | null = null;
  mainWindow.on("move", () => {
    if (!mainWindow) return;
    const [nx, ny] = mainWindow.getPosition();

    // Ignore events that match the programmatic target (the window settling
    // after a setProgrammaticPosition call). Clear the target once we see
    // the first matching position so subsequent real drags are captured.
    if (
      programmaticTarget &&
      nx === programmaticTarget.x &&
      ny === programmaticTarget.y
    ) {
      if (programmaticCleanupTimer) clearTimeout(programmaticCleanupTimer);
      programmaticTarget = null;
      programmaticCleanupTimer = null;
      return;
    }

    // If programmaticTarget is set but coords don't match yet, the window is
    // still mid-animation — ignore until it settles.
    if (programmaticTarget) return;

    // Ignore sub-threshold moves so accidental bumps don't override the preset.
    const currentSetting = readSettings().pillPosition as string;
    if (currentSetting !== "custom") {
      const presetPos = getAppWindowPosition();
      if (Math.abs(nx - presetPos.x) < 10 && Math.abs(ny - presetPos.y) < 10)
        return;
    }

    if (moveTimeout) clearTimeout(moveTimeout);
    moveTimeout = setTimeout(() => {
      if (!mainWindow) return;
      const [fx, fy] = mainWindow.getPosition();
      writeSettings({
        pillPosition: "custom",
        pillCustomPosition: { x: fx, y: fy },
      });
      const alignment = getPillAlignmentForCustom();
      mainWindow.webContents.send("settings:pill-position-changed", alignment);
      settingsWindow?.webContents.send(
        "settings:pill-position-changed",
        alignment,
      );
    }, 200);
  });

  mainWindow.on("closed", () => {
    if (moveTimeout) {
      clearTimeout(moveTimeout);
      moveTimeout = null;
    }
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  mainWindow.loadURL(getPillURL());
}

function createSettingsWindow(initialPath?: string): void {
  settingsWindow = new BrowserWindow({
    width: 1152,
    height: 648,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition:
      process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  settingsWindow.on("ready-to-show", () => {
    if (process.platform === "darwin") {
      app.dock?.show();
      app.focus({ steal: true });
    }
    settingsWindow!.show();
    settingsWindow!.focus();
  });

  settingsWindow.on("closed", () => {
    if (hotkeyRecorder) {
      stopHotkeyRecorderProcess();
      scheduleHotkeyRegistration(currentHotkeyAccel ?? undefined);
    }
    settingsWindow = null;
  });

  settingsWindow.on("enter-full-screen", () => {
    settingsWindow?.webContents.send("fullscreen:changed", true);
  });

  settingsWindow.on("leave-full-screen", () => {
    settingsWindow?.webContents.send("fullscreen:changed", false);
  });

  settingsWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // Check if onboarding is complete to decide initial route
  let onboardingDone = readSettings().onboardingComplete === true;

  // Also consider onboarding done if the DB has any configured models
  // (existing users who never went through onboarding)
  if (!onboardingDone) {
    try {
      const dbPath = process.env.FREESTYLE_DB_PATH;
      if (dbPath) {
        const { DatabaseSync } = require("node:sqlite");
        const db = new DatabaseSync(dbPath);
        const row = db
          .prepare("SELECT COUNT(*) as count FROM model_configs")
          .get() as { count: number } | undefined;
        db.close();
        if (row && row.count > 0) onboardingDone = true;
      }
    } catch {
      // DB may not exist yet -- that's fine, show onboarding
    }
  }

  // Wire the plugin UI host (asset protocol, view manager, IPC) to this window
  // and do an initial plugin discovery scan.
  initPluginUiHost({
    window: settingsWindow,
    getBridgeConfig: getPluginBridgeConfig,
    getDiscoverySources: getPluginDiscoverySources,
    setPluginEnabled: async (specifier, enabled) => {
      // Persist + reload the server's registry, then rebuild the app-host
      // registry so app-side hooks for this plugin start/stop immediately.
      await setPluginEnabled(getServerTarget(), specifier, enabled);
      await reloadAppPlugins(getServerTarget());
    },
    getCatalog: () => fetchCatalog(getServerTarget()),
    installPlugin: async (npmName, version) => {
      await installPlugin(getServerTarget(), npmName, version);
      await reloadAppPlugins(getServerTarget());
    },
    uninstallPlugin: async (specifier) => {
      await uninstallPlugin(getServerTarget(), specifier);
      await reloadAppPlugins(getServerTarget());
    },
    onAction: handlePluginAction,
  });
  void getPluginDiscoverySources().then(
    ({ pluginsSetting, userDataDir, disabledPlugins }) =>
      refreshPluginUi(pluginsSetting, userDataDir, disabledPlugins),
  );

  const startPath = !onboardingDone ? "/onboarding" : (initialPath ?? "/today");
  settingsWindow.loadURL(getDashboardURL(startPath));
}

/** The local server target for plugin settings/discovery. */
function getServerTarget(): {
  baseUrl: string;
  directory: string;
} {
  return {
    baseUrl: getServerBaseUrl(),
    directory: app.getPath("userData"),
  };
}

/** Bridge config (server URL) injected into plugin UI frames. */
function getPluginBridgeConfig(): BridgeConfig {
  return {
    serverUrl: getServerBaseUrl(),
  };
}

/**
 * Resolve the `plugins` setting + disabled set (over HTTP, so a remote server
 * works too) plus the user-data dir for UI plugin discovery.
 */
async function getPluginDiscoverySources(): Promise<{
  pluginsSetting: string | undefined;
  userDataDir: string;
  disabledPlugins: ReadonlySet<string>;
}> {
  const { pluginsSetting, disabled } = await fetchPluginSettings(
    getServerTarget(),
  );
  return {
    pluginsSetting,
    userDataDir: app.getPath("userData"),
    disabledPlugins: disabled,
  };
}

/** Perform a host action requested by a plugin UI page over the bridge. */
function handlePluginAction(
  channel: keyof import("freestyle-voice").HostActions,
  payload: unknown,
): void {
  switch (channel) {
    case "copy": {
      const { text } = payload as { text: string };
      if (text) clipboard.writeText(text);
      break;
    }
    case "toast": {
      const { message } = payload as { message: string };
      if (message && Notification.isSupported()) {
        new Notification({ title: "Freestyle", body: message }).show();
      }
      break;
    }
    case "navigate": {
      const { to } = payload as { to: string };
      settingsWindow?.webContents.send("plugin:navigate", to);
      break;
    }
  }
}

/**
 * Resolves once a freshly-created pill window has finished loading and is
 * visible.  `null` when no deferred show is in progress.
 */
let pillReadyPromise: Promise<void> | null = null;

function showPill(): void {
  // Already waiting for a freshly-created pill to finish loading.
  if (pillReadyPromise) return;

  if (!mainWindow) {
    createAppWindow();
    // createAppWindow() synchronously assigns mainWindow, but TypeScript
    // cannot track mutations through function calls.  Re-read and bail
    // out if the assignment unexpectedly failed.
    const win = mainWindow as BrowserWindow | null;
    if (!win) return;

    // The window was just created with `show: false` and is still loading.
    // Defer showing until the renderer finishes loading so IPC messages
    // (e.g. hotkey:down) sent immediately after are not lost.
    pillReadyPromise = new Promise<void>((resolve) => {
      const cleanup = (): void => {
        pillReadyPromise = null;
        resolve();
      };

      // If the window is closed before it finishes loading, resolve the
      // promise so deferred IPC calls are not stuck forever.
      win.once("closed", cleanup);

      win.webContents.once("did-finish-load", () => {
        win.removeListener("closed", cleanup);
        pillReadyPromise = null;
        if (!mainWindow) {
          resolve();
          return;
        }
        const { x, y } = getAppWindowPosition();
        setProgrammaticPosition(mainWindow, x, y);
        mainWindow.showInactive();
        registerPillEscape();
        resolve();
      });
    });
    return;
  }

  if (!mainWindow.isVisible()) {
    const { x, y } = getAppWindowPosition();
    setProgrammaticPosition(mainWindow, x, y);
    mainWindow.showInactive();
  }

  registerPillEscape();
}

function registerPillEscape(): void {
  if (!globalShortcut.isRegistered("Escape")) {
    globalShortcut.register("Escape", () => {
      if (mainWindow?.isVisible()) {
        mainWindow.webContents.send("pill:cancel");
      }
    });
  }
}

// -- Async helper: run a command without blocking the main thread --
function execAsync(
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
        else resolve((stdout as string).trim());
      },
    );
  });
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

// -- Linux (X11): Get active window name + title via xdotool --
async function getLinuxFrontmostApp(): Promise<string | null> {
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

function hidePill(): void {
  if (mainWindow?.isVisible()) {
    mainWindow.hide();
  }
  // Session ended (cancel, error, or paste complete). Clear latched hotkey
  // state so the next press starts fresh — e.g. after ESC while still
  // holding the dictation key.
  hotkeyPressed = false;
  // Unregister Escape shortcut when pill is hidden
  try {
    globalShortcut.unregister("Escape");
  } catch {}
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deliver final dictation text to the user's focused app. Runs the
 * `beforeOutput` plugin hook first, which may rewrite the text or switch the
 * delivery `mode` between paste, copy, and `none` (suppress). Emits the
 * `outputDelivered` event with whatever mode was ultimately used.
 */
async function deliverOutput(
  text: string,
  mode: typeof OutputMode.Paste | typeof OutputMode.Clipboard,
  appContext: string | null,
): Promise<void> {
  const parsedContext = parseAppContext(appContext);
  const out = await appPlugins().run(
    "beforeOutput",
    { ...(parsedContext ? { appContext: parsedContext } : {}) },
    { text, mode },
  );

  // Nothing to deliver (empty text, or a plugin suppressed via None): report
  // it as delivered with mode None so observers see a single, accurate event.
  if (out.mode === OutputMode.None || !out.text?.trim()) {
    void appPlugins().emit({
      type: FreestyleEventType.OutputDelivered,
      text: out.text,
      mode: OutputMode.None,
    });
    return;
  }

  try {
    if (out.mode === OutputMode.Paste) {
      await pasteIntoFocusedApp(out.text, async () => {
        hidePill();
        await wait(0);
      });
    } else {
      clipboard.writeText(out.text);
    }
  } catch (err) {
    // pasteIntoFocusedApp left the transcript on the clipboard — tell the user
    // instead of letting the dictation silently vanish.
    notifyPasteFailed();
    void appPlugins().emit({
      type: FreestyleEventType.PipelineError,
      stage: PipelineStage.Output,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  void appPlugins().emit({
    type: FreestyleEventType.OutputDelivered,
    text: out.text,
    mode: out.mode,
  });
}

function resetOnboarding(): void {
  writeSettings({ onboardingComplete: false });
  showSettingsWindow("/onboarding");
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
    await stopWhisperServer().catch(() => {});
    await stopMlxServer().catch(() => {});

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

function showSettingsWindow(path?: string): void {
  if (!settingsWindow) {
    createSettingsWindow(path);
    return;
  }
  if (path) {
    void settingsWindow.loadURL(getDashboardURL(path));
  }
  if (process.platform === "darwin") {
    app.dock?.show();
    app.focus({ steal: true });
  }
  settingsWindow.show();
  settingsWindow.focus();
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
  settingsWindow?.webContents.send("updater:downloading");
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
      click: () => showSettingsWindow(),
    },
    buildUpdateMenuItem(),
    ...(is.dev
      ? [
          { type: "separator" as const },
          {
            label: "Reset Onboarding",
            click: resetOnboarding,
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
    showSettingsWindow();
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
                click: () => showSettingsWindow(),
              },
              { type: "separator" as const },
              buildUpdateMenuItem(),
              ...(is.dev
                ? [
                    { type: "separator" as const },
                    {
                      label: "Reset Onboarding",
                      click: resetOnboarding,
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
  if (settingsWindow) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
  } else {
    showSettingsWindow();
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  void startLinuxPasteHelper();

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

  // IPC: paste text at cursor
  ipcMain.handle(
    "paste:text",
    async (_event, text: string, appContext?: string | null) => {
      await deliverOutput(text, OutputMode.Paste, appContext ?? null);
    },
  );

  // IPC: copy text to clipboard
  ipcMain.handle(
    "copy:text",
    async (_event, text: string, appContext?: string | null) => {
      await deliverOutput(text, OutputMode.Clipboard, appContext ?? null);
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

  // IPC: broadcast output mode changes to pill window
  ipcMain.on("settings:output-mode-changed", (_event, mode: string) => {
    mainWindow?.webContents.send("settings:output-mode-changed", mode);
  });

  ipcMain.on("settings:audio-ducking-changed", (_event, enabled: boolean) => {
    mainWindow?.webContents.send("settings:audio-ducking-changed", enabled);
  });

  ipcMain.on("settings:audio-playback-mode-changed", (_event, mode: string) => {
    mainWindow?.webContents.send("settings:audio-playback-mode-changed", mode);
  });

  // IPC: hide the pill window on request from renderer
  ipcMain.on("pill:hide", () => {
    hidePill();
  });

  // IPC: fan out per-frame audio levels from the pill to other windows
  // (e.g. the Today tutorial demo) so they can render a live waveform.
  ipcMain.on("audio:level", (_event, level: number) => {
    if (typeof level !== "number") return;
    settingsWindow?.webContents.send("audio:level", level);
  });

  // IPC: pill notifies that a transcription has finished + been pasted, so
  // history-driven views (Today, History) can refetch without polling.
  ipcMain.on("transcription:done", () => {
    settingsWindow?.webContents.send("transcription:done");
  });

  ipcMain.on("recording:committed", () => {
    void appPlugins().emit({ type: FreestyleEventType.RecordingCommitted });
  });

  ipcMain.on("recording:cancelled", () => {
    void appPlugins().emit({ type: FreestyleEventType.RecordingCancelled });
  });

  // IPC: expose the server port to the renderer
  ipcMain.handle("server:port", () => serverPort);

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
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
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
      message: "Sign in to Freestyle Cloud",
      detail:
        "Freestyle Cloud needs you to sign in before it can transcribe or clean up text. Open Models settings to sign in or switch providers.",
      buttons: ["Open Models", "Not Now"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return false;
    showSettingsWindow("/settings/models");
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
    const { systemPreferences } = await import("electron");
    return systemPreferences.getMediaAccessStatus("microphone");
  });

  ipcMain.handle("permissions:request-mic", async () => {
    if (process.platform === "darwin") {
      const { systemPreferences } = await import("electron");
      const granted = await systemPreferences.askForMediaAccess("microphone");
      return granted ? "granted" : "denied";
    }
    if (process.platform === "win32") {
      // Windows has no programmatic prompt; report the privacy-settings
      // state so the UI can send the user to Settings when it's denied.
      const { systemPreferences } = await import("electron");
      return systemPreferences.getMediaAccessStatus("microphone");
    }
    return "unknown"; // Linux: renderer probes getUserMedia instead
  });

  ipcMain.handle("permissions:check-accessibility", async () => {
    if (process.platform === "darwin") {
      const { systemPreferences } = await import("electron");
      const trusted = systemPreferences.isTrustedAccessibilityClient(false);
      return trusted || accessibilityConfirmed;
    }
    return true;
  });

  ipcMain.on("permissions:open-accessibility", async () => {
    if (process.platform === "darwin") {
      // Passing `true` pops the native "would like to control this computer"
      // prompt and adds Freestyle to the Accessibility list automatically, so
      // the user only has to flip the toggle (macOS never lets us flip it).
      const { systemPreferences } = await import("electron");
      systemPreferences.isTrustedAccessibilityClient(true);
      shell.openExternal(
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility",
      );
    }
  });

  ipcMain.on("permissions:open-mic-settings", () => {
    if (process.platform === "darwin") {
      shell.openExternal(
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Microphone",
      );
    } else if (process.platform === "win32") {
      shell.openExternal("ms-settings:privacy-microphone");
    }
  });

  // IPC: Linux system setup (input-group access for the hotkey listener and
  // the xdotool/wtype paste fallback). Returns null on other platforms.
  ipcMain.handle("permissions:check-linux-setup", async () => {
    if (process.platform !== "linux") return null;
    return checkLinuxSetup();
  });

  ipcMain.handle("onboarding:complete", () => {
    return readSettings().onboardingComplete === true;
  });

  ipcMain.on("onboarding:set-complete", () => {
    writeSettings({ onboardingComplete: true });
  });

  // IPC: hotkey recording — global native listener + renderer DOM on macOS
  ipcMain.on("hotkey-record:start", () => {
    // Pause the active hotkey listener so it doesn't fire during recording
    if (keyListener) {
      keyListener.stop();
      keyListener = null;
    }
    globalShortcut.unregisterAll();

    stopHotkeyRecorderProcess();
    const target =
      settingsWindow?.webContents ?? mainWindow?.webContents ?? null;
    if (!target) return;

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
  if (!is.dev) {
    process.env.FREESTYLE_MLX_ASR_RELEASE_TAG ||= app.getVersion();
  }

  // Run non-critical server startup tasks now that the DB path is set
  reconcileUnsupportedMlxVoiceDefault();
  autoStartWhisperServer();

  // Start the Hono HTTP server with WebSocket support (or reuse an existing one)
  const startServer = (port: number): void => {
    startFreestyleServer({ port, host: "127.0.0.1" })
      .then(({ server, port: boundPort }) => {
        httpServer = server;
        serverPort = boundPort;
        log.info(`Server running on http://localhost:${boundPort}`);
        initPluginsForServer();
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

  // Check if a Freestyle server is already running on the default port.
  let existingServer = false;
  try {
    const res = await net.fetch(`http://127.0.0.1:${DEFAULT_PORT}/api/health`);
    if (res.ok) {
      const data = (await res.json()) as { status?: string; name?: string };
      existingServer = data?.status === "ok" && data?.name === "freestyle";
    }
  } catch {}

  if (existingServer) {
    serverPort = DEFAULT_PORT;
    log.info(
      `Reusing existing Freestyle server on http://localhost:${DEFAULT_PORT}`,
    );
    initPluginsForServer();
  } else {
    startServer(DEFAULT_PORT);
  }

  if (!is.dev) {
    void activateManagedMlxRuntimeForAppVersion(app.getVersion()).catch(
      (err) => {
        log.warn(
          `Failed to activate MLX runtime for app ${app.getVersion()}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      },
    );
  }

  createTray();

  createAppWindow();

  // Clamp the pill to valid display bounds when monitors change.
  const repositionPillForDisplayChange = (): void => {
    if (!mainWindow) return;
    const before = readSettings().pillPosition as string;
    const { x, y } = getAppWindowPosition();
    setProgrammaticPosition(mainWindow, x, y);
    const after = (readSettings().pillPosition as string) ?? "bottom-center";
    if (before !== after) {
      mainWindow.webContents.send("settings:pill-position-changed", after);
      settingsWindow?.webContents.send("settings:pill-position-changed", after);
    }
  };
  screen.on("display-removed", repositionPillForDisplayChange);
  screen.on("display-metrics-changed", repositionPillForDisplayChange);

  if (readSettings().showDashboardOnLaunch !== false) {
    showSettingsWindow();
  }

  // -- Auto-update helpers --
  const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  let updateCheckTimer: ReturnType<typeof setInterval> | null = null;

  function startUpdateCheckInterval(): void {
    if (updateCheckTimer) return;
    updateCheckTimer = setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, UPDATE_CHECK_INTERVAL_MS);
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
      settingsWindow?.webContents.send("updater:available", {
        version: info.version,
      });
      if (autoUpdater.autoDownload) {
        updateDownloadState = "downloading";
        settingsWindow?.webContents.send("updater:downloading");
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
        note.on("click", () => showSettingsWindow("/settings"));
        note.show();
      }
    });

    autoUpdater.on("update-downloaded", (info) => {
      updateDownloadState = "downloaded";
      settingsWindow?.webContents.send("updater:downloaded", {
        version: info.version,
      });
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
        note.on("click", () => showSettingsWindow("/settings"));
        note.show();
      }
      // No need to keep polling once the update is downloaded
      if (updateCheckTimer) {
        clearInterval(updateCheckTimer);
        updateCheckTimer = null;
      }
      rebuildMenus();
      void prefetchManagedMlxRuntimeForAppRelease(info.version).catch((err) => {
        log.warn(
          `Failed to stage MLX runtime for ${info.version}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    });

    autoUpdater.on("error", (err) => {
      if (updateDownloadState === "downloading") {
        updateDownloadState = "idle";
      }
      const msg = err?.message ?? "Update failed";
      if (READ_ONLY_UPDATE_RE.test(msg) && isRunningFromReadOnlyLocation()) {
        showMoveToApplicationsDialog();
        settingsWindow?.webContents.send("updater:error", {
          message:
            "Freestyle is running from a read-only location. Move it to Applications and relaunch.",
        });
      } else {
        settingsWindow?.webContents.send("updater:error", { message: msg });
      }
    });

    if (isRunningFromReadOnlyLocation()) {
      if (Notification.isSupported()) {
        const note = new Notification({
          title: "Move Freestyle to Applications",
          body: "Freestyle can\u2019t update from this location. Move it to your Applications folder and relaunch.",
        });
        note.on("click", () => showSettingsWindow("/settings"));
        note.show();
      }
    } else {
      autoUpdater.checkForUpdatesAndNotify();
      startUpdateCheckInterval();
    }
  }

  ipcMain.on("updater:download", () => {
    triggerDownloadUpdate();
  });

  ipcMain.on("updater:install", () => {
    restartAndUpdate();
  });

  ipcMain.handle("updater:check", async () => {
    if (is.dev) return null;
    try {
      const result = await autoUpdater.checkForUpdates();
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

  // -- Show dashboard on launch setting IPC --
  ipcMain.handle("settings:show-dashboard-on-launch", () => {
    return readSettings().showDashboardOnLaunch !== false;
  });

  ipcMain.on(
    "settings:set-show-dashboard-on-launch",
    (_event, enabled: boolean) => {
      writeSettings({ showDashboardOnLaunch: enabled });
    },
  );

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

  // -- Pill position setting --
  ipcMain.handle("settings:pill-position", () => {
    const pos = (readSettings().pillPosition as string) ?? "bottom-center";
    // For a custom position, derive the correct top/bottom alignment token
    // from the actual window position relative to its display.
    if (pos === "custom") return getPillAlignmentForCustom();
    return pos;
  });

  ipcMain.on("settings:set-pill-position", (_event, position: string) => {
    if (position === "custom") {
      writeSettings({ pillPosition: position });
    } else {
      writeSettings({ pillPosition: position, pillCustomPosition: undefined });
    }
    // Reposition the window and notify the renderer for CSS alignment.
    if (mainWindow) {
      const { x, y } = getAppWindowPosition();
      setProgrammaticPosition(mainWindow, x, y);
    }
    // For custom, resolve the live alignment; for presets, send as-is.
    const broadcast =
      position === "custom" ? getPillAlignmentForCustom() : position;
    mainWindow?.webContents.send("settings:pill-position-changed", broadcast);
    settingsWindow?.webContents.send(
      "settings:pill-position-changed",
      broadcast,
    );
  });

  // Register hold-to-record hotkey via native platform binary
  hotkeyActivationMode = loadHotkeyModeFromDB();
  scheduleHotkeyRegistration();

  // Start microphone activity monitoring
  micListener = new MicListener({
    excludePid: process.pid,
    onStateChange: (state) => {
      mainWindow?.webContents.send("mic:activity-changed", state);
      settingsWindow?.webContents.send("mic:activity-changed", state);
    },
  });
  micListener.start();

  // Listen for hotkey changes from the settings UI
  ipcMain.on("hotkey:update", (_event, newHotkey: string) => {
    scheduleHotkeyRegistration(newHotkey);
  });

  ipcMain.on("hotkey:reload", () => {
    hotkeyActivationMode = loadHotkeyModeFromDB();
    scheduleHotkeyRegistration(currentHotkeyAccel ?? undefined);
  });

  ipcMain.on("hotkey:set-mode", (_event, mode: string) => {
    hotkeyActivationMode = mode === "toggle" ? "toggle" : "hold";
    hotkeyPressed = false;
    scheduleHotkeyRegistration(currentHotkeyAccel ?? undefined);
  });
});

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

function loadHotkeyFromDB(): string | undefined {
  try {
    const dbPath = process.env.FREESTYLE_DB_PATH;
    if (dbPath) {
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(dbPath);
      const row = db
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get(SETTINGS_KEYS.hotkey) as { value: string } | undefined;
      db.close();
      if (row?.value && isValidAccelerator(row.value)) {
        return row.value;
      }
    }
  } catch {
    // Ignore errors
  }
  return undefined;
}

function loadHotkeyModeFromDB(): "hold" | "toggle" {
  try {
    const dbPath = process.env.FREESTYLE_DB_PATH;
    if (dbPath) {
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(dbPath);
      const row = db
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get(SETTINGS_KEYS.hotkeyMode) as { value: string } | undefined;
      db.close();
      if (row?.value === "toggle") return "toggle";
    }
  } catch {
    // Ignore errors
  }
  return "hold";
}

function sendHotkeyDown(): void {
  showPill();
  void appPlugins().emit({ type: FreestyleEventType.RecordingStarted });
  if (pillReadyPromise) {
    // The pill window is still loading — defer IPC until it can receive it.
    void pillReadyPromise.then(() => {
      mainWindow?.webContents.send("hotkey:down");
      settingsWindow?.webContents.send("hotkey:down");
    });
    return;
  }
  mainWindow?.webContents.send("hotkey:down");
  settingsWindow?.webContents.send("hotkey:down");
}

function sendHotkeyUp(): void {
  if (pillReadyPromise) {
    // Preserve IPC ordering: hotkey:up must arrive after hotkey:down.
    void pillReadyPromise.then(() => {
      mainWindow?.webContents.send("hotkey:up");
      settingsWindow?.webContents.send("hotkey:up");
    });
    return;
  }
  mainWindow?.webContents.send("hotkey:up");
  settingsWindow?.webContents.send("hotkey:up");
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
    sendHotkeyDown();
  }
}

function handleNativeHotkeyUp(): void {
  if (hotkeyActivationMode === "toggle") return;

  if (hotkeyPressed) {
    hotkeyPressed = false;
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
    const tool = isWaylandSession() ? "wtype" : "xdotool";
    hint = ` Installing ${tool} may fix this (e.g. sudo apt install ${tool}).`;
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
    globalShortcut.unregisterAll();

    if (!hotkey) {
      hotkey = loadHotkeyFromDB();
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
        mainWindow?.webContents.send("hotkey:error", errorPayload);
        settingsWindow?.webContents.send("hotkey:error", errorPayload);
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
  if (keyListener) {
    keyListener.stop();
    keyListener = null;
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
  showSettingsWindow();
});

// Gracefully shut down the HTTP server and flush Sentry before quitting
let isUpdaterQuitting = false;
let isQuitting = false;

let updateDownloadState: "idle" | "downloading" | "downloaded" = "idle";

function cleanupBeforeQuit(): void {
  void appPlugins().dispose();
  void disposeServerPlugins().catch(() => {});
  audioPlaybackController.restoreSync();
  stopLinuxPasteHelper();
  stopWhisperServer().catch(() => {});
  stopMlxServer().catch(() => {});
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
    cleanupBeforeQuit();
    return;
  }
  if (isQuitting) return;
  isQuitting = true;
  event.preventDefault();
  cleanupBeforeQuit();
  app.exit(0);
});
