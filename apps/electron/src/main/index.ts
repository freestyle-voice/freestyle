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

import { execFile } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import server, {
  autoStartMlxAsrServer,
  autoStartWhisperServer,
  reconcileUnsupportedMlxVoiceDefault,
} from "@freestyle/server";
import { serve } from "@hono/node-server";
import {
  app,
  BrowserWindow,
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
import { WebSocketServer } from "ws";
import icon from "../../resources/icon.png?asset";
import trayIconPath from "../../resources/tray/logoTemplate.png?asset";
import { HotkeyRecorder } from "./hotkey-recorder";
import { normalizeAccelerator } from "./hotkey-utils";
import { NativeKeyListener } from "./key-listener";
import { MicListener } from "./mic-listener";
import { pasteIntoFocusedApp } from "./paste";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let httpServer: any = null;
let serverPort = DEFAULT_PORT;
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let keyListener: NativeKeyListener | null = null;
// Latching flag: once the native key listener (or globalShortcut fallback)
// has started successfully, accessibility is confirmed. The flag persists
// even when keyListener is temporarily torn down for hotkey recording.
let accessibilityConfirmed = false;
let hotkeyPressed = false;
let currentHotkeyAccel: string | null = null;
let hotkeyActivationMode: "hold" | "toggle" = "hold";
let micListener: MicListener | null = null;
let hotkeyRecorder: HotkeyRecorder | null = null;

function stopHotkeyRecorderProcess(): void {
  hotkeyRecorder?.stop();
  hotkeyRecorder = null;
}

// Register a custom app:// protocol that serves the renderer files.
// All non-file paths fall back to index.html so BrowserRouter works in production.
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

function getAppWindowPosition(): { x: number; y: number } {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Read pill position preference
  const position = (readSettings().pillPosition as string) || "bottom-center";

  // The pill is aligned inside the window via CSS (justify-center or
  // justify-end). Push bottom positions 10px past the work area edge
  // so the pill sits closer to the dock/taskbar.
  const bottomOverlap = 14;
  const topOverlap = 0;
  switch (position) {
    case "top-center":
      return { x: Math.round((width - APP_WIDTH) / 2), y: topOverlap };
    case "top-right":
      return { x: width - APP_WIDTH, y: topOverlap };
    case "bottom-right":
      return {
        x: width - APP_WIDTH,
        y: height - APP_HEIGHT + bottomOverlap,
      };
    default:
      return {
        x: Math.round((width - APP_WIDTH) / 2),
        y: height - APP_HEIGHT + bottomOverlap,
      };
  }
}

function createAppWindow(): void {
  const { x, y } = getAppWindowPosition();

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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  mainWindow.loadURL(getPillURL());
}

function createSettingsWindow(): void {
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
      registerHotkey(currentHotkeyAccel ?? undefined);
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

  settingsWindow.loadURL(
    getDashboardURL(onboardingDone ? "/today" : "/onboarding"),
  );
}

function showPill(): void {
  if (!mainWindow) {
    createAppWindow();
    return;
  }

  if (!mainWindow.isVisible()) {
    const { x, y } = getAppWindowPosition();
    mainWindow.setPosition(x, y);
    mainWindow.showInactive();
  }

  // On Windows, register Escape as a global shortcut while the pill
  // is visible so the user can cancel recording/transcription.
  if (process.platform === "win32") {
    if (!globalShortcut.isRegistered("Escape")) {
      globalShortcut.register("Escape", () => {
        if (mainWindow?.isVisible()) {
          mainWindow.webContents.send("pill:cancel");
        }
      });
    }
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
  // Unregister Escape shortcut when pill is hidden (Windows only)
  if (process.platform === "win32") {
    try {
      globalShortcut.unregister("Escape");
    } catch {}
  }
}

function resetOnboarding(): void {
  writeSettings({ onboardingComplete: false });
  if (settingsWindow) {
    settingsWindow.loadURL(getDashboardURL("/onboarding"));
    settingsWindow.show();
    settingsWindow.focus();
  } else {
    showSettingsWindow();
  }
}

function showSettingsWindow(): void {
  if (!settingsWindow) {
    createSettingsWindow();
    return;
  }
  if (process.platform === "darwin") {
    app.dock?.show();
    app.focus({ steal: true });
  }
  settingsWindow.show();
  settingsWindow.focus();
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
        autoUpdater.downloadUpdate();
      }
    } else {
      dialog.showMessageBox({
        type: "info",
        title: "No Updates",
        message: "You are running the latest version.",
        detail: `Current version: v${app.getVersion()}`,
      });
    }
  } catch {
    dialog.showMessageBox({
      type: "error",
      title: "Update Check Failed",
      message: "Unable to check for updates. Please try again later.",
    });
  }
}

function createTray(): void {
  const trayImage = nativeImage.createFromPath(trayIconPath);
  // Mark as template so macOS adapts to menu bar light/dark
  trayImage.setTemplateImage(true);

  tray = new Tray(trayImage);
  tray.setToolTip("Freestyle");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Settings",
      click: () => showSettingsWindow(),
    },
    {
      label: "Check for Updates...",
      click: () => checkForUpdatesFromMenu(),
    },
    ...(is.dev
      ? [
          { type: "separator" as const },
          {
            label: "Reset Onboarding",
            click: resetOnboarding,
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

  // Left-click: open the settings window
  tray.on("click", () => {
    showSettingsWindow();
  });

  // Right-click: show context menu
  tray.on("right-click", () => {
    tray!.popUpContextMenu(contextMenu);
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.freestyle.app");

  // Override app.name so macOS menu shows "Freestyle" instead of the package name
  app.setName("Freestyle");

  // Register the custom app:// protocol for production SPA support
  registerAppProtocol();

  // Set a minimal application menu
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
              {
                label: "Check for Updates...",
                click: () => checkForUpdatesFromMenu(),
              },
              ...(is.dev
                ? [
                    { type: "separator" as const },
                    {
                      label: "Reset Onboarding",
                      click: resetOnboarding,
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

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC: paste text at cursor
  ipcMain.handle("paste:text", async (_event, text: string) => {
    await pasteIntoFocusedApp(text);
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

  // IPC: expose the server port to the renderer
  ipcMain.handle("server:port", () => serverPort);

  // IPC: permission checks
  ipcMain.handle("permissions:check-mic", async () => {
    if (process.platform === "darwin") {
      const { systemPreferences } = await import("electron");
      return systemPreferences.getMediaAccessStatus("microphone");
    }
    return "granted"; // Windows/Linux don't have this API
  });

  ipcMain.handle("permissions:request-mic", async () => {
    if (process.platform === "darwin") {
      const { systemPreferences } = await import("electron");
      const granted = await systemPreferences.askForMediaAccess("microphone");
      return granted ? "granted" : "denied";
    }
    return "granted";
  });

  ipcMain.handle("permissions:check-accessibility", async () => {
    if (process.platform === "darwin") {
      const { systemPreferences } = await import("electron");
      const trusted = systemPreferences.isTrustedAccessibilityClient(false);
      // The Electron API can return a stale result when the code signature
      // changes between builds. Cross-check with accessibilityConfirmed —
      // a latching flag set when the native key listener (or globalShortcut
      // fallback) starts successfully, proving accessibility is working.
      return trusted || accessibilityConfirmed;
    }
    return true;
  });

  ipcMain.on("permissions:open-accessibility", () => {
    if (process.platform === "darwin") {
      shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      );
    }
  });

  ipcMain.on("permissions:open-mic-settings", () => {
    if (process.platform === "darwin") {
      shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
      );
    }
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
    if (process.platform === "win32") {
      globalShortcut.unregisterAll();
    }

    stopHotkeyRecorderProcess();
    const target =
      settingsWindow?.webContents ?? mainWindow?.webContents ?? null;
    if (!target) return;

    hotkeyRecorder = new HotkeyRecorder({
      onModifiers: () => {},
      onCaptured: () => {},
      onCancel: () => {
        stopHotkeyRecorderProcess();
        registerHotkey(currentHotkeyAccel ?? undefined);
      },
      onError: (message) => {
        console.warn("[hotkey-recorder]", message);
      },
    });
    hotkeyRecorder.start(target);
  });

  ipcMain.on("hotkey-record:pause-recorder", () => {
    stopHotkeyRecorderProcess();
  });

  ipcMain.on("hotkey-record:stop", (_event, hotkey?: string) => {
    stopHotkeyRecorderProcess();
    registerHotkey(
      typeof hotkey === "string" && hotkey.length > 0
        ? hotkey
        : (currentHotkeyAccel ?? undefined),
    );
  });

  // Set database path for the server before any API calls
  process.env.FREESTYLE_DB_PATH = join(app.getPath("userData"), "freestyle.db");

  process.env.FREESTYLE_ENV = is.dev ? "development" : "production";

  // Run non-critical server startup tasks now that the DB path is set
  reconcileUnsupportedMlxVoiceDefault();
  autoStartWhisperServer();
  autoStartMlxAsrServer();

  // Start the Hono HTTP server with WebSocket support (or reuse an existing one)
  function startServer(port: number): void {
    const wss = new WebSocketServer({ noServer: true });
    httpServer = serve(
      {
        fetch: server.fetch,
        port,
        websocket: { server: wss },
      },
      (info) => {
        serverPort = info.port;
        console.log(`Server running on http://localhost:${info.port}`);
      },
    );

    httpServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && port === DEFAULT_PORT) {
        console.warn(
          `Port ${DEFAULT_PORT} in use, falling back to random port`,
        );
        startServer(0);
      } else {
        console.error("Server failed to start:", err);
      }
    });
  }

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
    console.log(
      `Reusing existing Freestyle server on http://localhost:${DEFAULT_PORT}`,
    );
  } else {
    startServer(DEFAULT_PORT);
  }

  createTray();

  createAppWindow();

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
  // Track the version we already notified about so periodic checks don't
  // spam the user with repeat notifications every 5 minutes.
  let notifiedVersion: string | null = null;
  let updateDownloadState: "idle" | "downloading" | "downloaded" = "idle";

  if (!is.dev) {
    const autoUpdateEnabled = readSettings().autoUpdate !== false;
    autoUpdater.autoDownload = autoUpdateEnabled;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("update-available", (info) => {
      settingsWindow?.webContents.send("updater:available", {
        version: info.version,
      });
      if (autoUpdater.autoDownload) {
        updateDownloadState = "downloading";
        settingsWindow?.webContents.send("updater:downloading");
      }
      // Only show a native notification once per discovered version
      if (Notification.isSupported() && notifiedVersion !== info.version) {
        notifiedVersion = info.version;
        const note = new Notification({
          title: "Freestyle Update Available",
          body: autoUpdater.autoDownload
            ? `Version ${info.version} is downloading…`
            : `Version ${info.version} is available. Open settings to download.`,
        });
        note.on("click", () => showSettingsWindow());
        note.show();
      }
    });

    autoUpdater.on("update-downloaded", (info) => {
      updateDownloadState = "downloaded";
      settingsWindow?.webContents.send("updater:downloaded", {
        version: info.version,
      });
      if (Notification.isSupported()) {
        const note = new Notification({
          title: "Update Ready to Install",
          body: `Version ${info.version} has been downloaded. Restart to update.`,
        });
        note.on("click", () => showSettingsWindow());
        note.show();
      }
    });

    autoUpdater.on("error", (err) => {
      if (updateDownloadState === "downloading") {
        updateDownloadState = "idle";
      }
      settingsWindow?.webContents.send("updater:error", {
        message: err?.message ?? "Update failed",
      });
    });

    autoUpdater.checkForUpdatesAndNotify();

    // Always start periodic background checking regardless of auto-update setting
    startUpdateCheckInterval();
  }

  ipcMain.on("updater:download", () => {
    updateDownloadState = "downloading";
    autoUpdater.downloadUpdate();
  });

  ipcMain.on("updater:install", () => {
    isUpdaterQuitting = true;
    autoUpdater.quitAndInstall();
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
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.on("settings:set-launch-at-startup", (_event, enabled: boolean) => {
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
    return (readSettings().pillPosition as string) ?? "bottom-center";
  });

  ipcMain.on("settings:set-pill-position", (_event, position: string) => {
    writeSettings({ pillPosition: position });
    // Reposition the window and notify the renderer for CSS alignment
    if (mainWindow) {
      const { x, y } = getAppWindowPosition();
      mainWindow.setPosition(x, y);
    }
    mainWindow?.webContents.send("settings:pill-position-changed", position);
  });

  // Register hold-to-record hotkey via native platform binary
  hotkeyActivationMode = loadHotkeyModeFromDB();
  registerHotkey();

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
    registerHotkey(newHotkey);
  });

  ipcMain.on("hotkey:reload", () => {
    hotkeyActivationMode = loadHotkeyModeFromDB();
    registerHotkey(currentHotkeyAccel ?? undefined);
  });

  ipcMain.on("hotkey:set-mode", (_event, mode: string) => {
    hotkeyActivationMode = mode === "toggle" ? "toggle" : "hold";
    hotkeyPressed = false;
    registerHotkey(currentHotkeyAccel ?? undefined);
  });
});

const DEFAULT_HOTKEY = "Alt+Space";

function isValidAccelerator(accel: string): boolean {
  if (!accel || typeof accel !== "string") return false;
  if (!/^[\x20-\x7E]+$/.test(accel)) return false;
  if (accel.endsWith("+")) return false;
  const parts = accel.split("+");
  if (parts.some((p) => !p.trim())) return false;
  return true;
}

function loadHotkeyFromDB(): string | undefined {
  try {
    const dbPath = process.env.FREESTYLE_DB_PATH;
    if (dbPath) {
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(dbPath);
      const row = db
        .prepare("SELECT value FROM settings WHERE key = 'hotkey'")
        .get() as { value: string } | undefined;
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
        .prepare("SELECT value FROM settings WHERE key = 'hotkey_mode'")
        .get() as { value: string } | undefined;
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
  mainWindow?.webContents.send("hotkey:down");
  settingsWindow?.webContents.send("hotkey:down");
}

function sendHotkeyUp(): void {
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

function registerHotkey(hotkey?: string): void {
  // Tear down previous listener
  if (keyListener) {
    keyListener.stop();
    keyListener = null;
  }
  hotkeyPressed = false;
  if (process.platform === "win32") {
    globalShortcut.unregisterAll();
  }

  if (!hotkey) {
    hotkey = loadHotkeyFromDB();
  }

  const normalized =
    hotkey && isValidAccelerator(hotkey) ? normalizeAccelerator(hotkey) : null;
  const accel = normalized ?? DEFAULT_HOTKEY;
  currentHotkeyAccel = accel;

  // Try native key listener binary first (all platforms)
  keyListener = new NativeKeyListener({
    hotkey: accel,
    onKeyDown: handleNativeHotkeyDown,
    onKeyUp: handleNativeHotkeyUp,
    onError: (error) => {
      console.error("[hotkey] Native key listener error:", error);
    },
    onReady: () => {
      if (process.env.NODE_ENV !== "production") {
        console.log(`[hotkey] Native key listener ready for "${accel}"`);
      }
    },
  });

  const started = keyListener.start();

  if (started) {
    accessibilityConfirmed = true;
  } else {
    console.warn(
      "[hotkey] Native key listener unavailable, falling back to Electron globalShortcut (toggle mode).",
    );
    keyListener = null;

    // Fallback: globalShortcut has no key-up — always use toggle semantics
    const registered = globalShortcut.register(accel, () => {
      if (!hotkeyPressed) {
        hotkeyPressed = true;
        sendHotkeyDown();
      } else {
        hotkeyPressed = false;
        sendHotkeyUp();
      }
    });
    if (registered) {
      accessibilityConfirmed = true;
    } else {
      const errorPayload = {
        message: `Could not register hotkey "${accel}". Try a different key combination in Settings.`,
      };
      mainWindow?.webContents.send("hotkey:error", errorPayload);
      settingsWindow?.webContents.send("hotkey:error", errorPayload);
    }
  }
}

// Clean up key listener and mic listener on quit
app.on("will-quit", () => {
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

function cleanupBeforeQuit(): void {
  fetch(`http://127.0.0.1:${serverPort}/api/whisper/server/stop`, {
    method: "POST",
  }).catch(() => {});
  fetch(`http://127.0.0.1:${serverPort}/api/mlx-asr/server/stop`, {
    method: "POST",
  }).catch(() => {});
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
