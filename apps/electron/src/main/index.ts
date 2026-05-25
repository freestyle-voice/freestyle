import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import server from "@freestyle/server";
import { serve } from "@hono/node-server";
import {
  app,
  BrowserWindow,
  dialog,
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
import type {
  IGlobalKeyDownMap,
  IGlobalKeyEvent,
} from "node-global-key-listener";
import { GlobalKeyboardListener } from "node-global-key-listener";
import { WebSocketServer } from "ws";
import icon from "../../resources/icon.png?asset";
import trayIconPath from "../../resources/tray/logoTemplate.png?asset";
import { pasteIntoFocusedApp } from "./paste";

const DEFAULT_PORT = 4649;
const APP_WIDTH = 440;
const APP_HEIGHT = 120;
const APP_BOTTOM_MARGIN = 0;

// ---------------------------------------------------------------------------
// settings.json helpers — single source for read/write of the lightweight
// JSON file the main process uses for settings it needs before the server
// is available (pillPosition, onboardingComplete, autoUpdate).
// ---------------------------------------------------------------------------

function readSettings(): Record<string, unknown> {
  try {
    const settingsPath = join(app.getPath("userData"), "settings.json");
    return JSON.parse(require("node:fs").readFileSync(settingsPath, "utf-8"));
  } catch {
    return {};
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
let keyListener: GlobalKeyboardListener | null = null;
let hotkeyPressed = false;
let currentHotkeyAccel: string | null = null;

/**
 * Ensure the MacKeyServer binary from node-global-key-listener is executable
 * and ad-hoc signed. Without a stable cdhash the macOS TCC subsystem cannot
 * persist Accessibility grants — the user approves access but it never sticks.
 * Also strips quarantine/provenance xattrs and sets the execute bit.
 *
 * This mirrors the postinstall script but runs at app launch as a safety net
 * (e.g. the binary was replaced by a package manager update).
 */
function ensureMacKeyServerExecutable(): void {
  if (process.platform !== "darwin") return;
  try {
    const pkgPath = require.resolve("node-global-key-listener/package.json");
    const candidate = join(dirname(pkgPath), "bin", "MacKeyServer");
    if (!existsSync(candidate)) return;
    const binPath = realpathSync(candidate);

    // Set execute bit if missing
    try {
      if (!(statSync(binPath).mode & 0o111)) {
        chmodSync(binPath, 0o755);
        console.log("[hotkey] Set execute permission on MacKeyServer.");
      }
    } catch (err) {
      console.warn("[hotkey] chmod failed:", err);
    }

    // Strip quarantine / provenance xattrs (best-effort)
    for (const attr of ["com.apple.quarantine", "com.apple.provenance"]) {
      spawnSync("xattr", ["-d", attr, binPath], { stdio: "ignore" });
    }

    // Ad-hoc codesign so TCC grants persist (stable cdhash)
    const result = spawnSync(
      "codesign",
      ["--sign", "-", "--force", "--preserve-metadata=entitlements", binPath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    if (result.status === 0) {
      console.log("[hotkey] Ad-hoc signed MacKeyServer binary.");
    } else {
      console.warn(
        `[hotkey] codesign failed (exit ${result.status}):`,
        result.stderr?.toString().trim(),
      );
    }
  } catch (err) {
    console.warn("[hotkey] Could not fix MacKeyServer permissions:", err);
  }
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

    // If the path has no file extension, serve index.html (SPA fallback)
    if (!filePath.match(/\.\w+$/)) {
      filePath = join(__dirname, "../renderer/index.html");
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function getRendererURL(path = "/"): string {
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

  const margin = 20;
  switch (position) {
    case "top-center":
      return { x: Math.round((width - APP_WIDTH) / 2), y: margin };
    case "top-right":
      return { x: width - APP_WIDTH - margin, y: margin };
    case "bottom-right":
      return {
        x: width - APP_WIDTH - margin,
        y: height - APP_HEIGHT - margin,
      };
    case "bottom-center":
    default:
      return {
        x: Math.round((width - APP_WIDTH) / 2),
        y: height - APP_HEIGHT - APP_BOTTOM_MARGIN,
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

  mainWindow.loadURL(getRendererURL("/app"));
}

function createSettingsWindow(): void {
  settingsWindow = new BrowserWindow({
    width: 800,
    height: 560,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
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
    getRendererURL(onboardingDone ? "/settings" : "/onboarding"),
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
}

// -- macOS: Get frontmost app + browser tab context via AppleScript --
function getMacFrontmostApp(): string | null {
  try {
    const { execSync } = require("node:child_process");
    const appName = execSync(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      { encoding: "utf-8", timeout: 2000 },
    ).trim();

    // For browsers, try to get the active tab URL and title
    const chromiumBrowsers = [
      "Google Chrome",
      "Arc",
      "Brave Browser",
      "Microsoft Edge",
    ];

    try {
      if (appName === "Safari") {
        const result = execSync(
          `osascript -e 'tell application "Safari" to return {URL of current tab of front window, name of current tab of front window}'`,
          { encoding: "utf-8", timeout: 2000 },
        ).trim();
        const idx = result.indexOf(", ");
        if (idx > 0) {
          return JSON.stringify({
            app: appName,
            url: result.substring(0, idx),
            title: result.substring(idx + 2),
          });
        }
      } else if (appName === "Firefox") {
        const title = execSync(
          `osascript -e 'tell application "System Events" to get name of front window of application process "Firefox"'`,
          { encoding: "utf-8", timeout: 2000 },
        ).trim();
        return JSON.stringify({ app: appName, windowTitle: title });
      } else if (chromiumBrowsers.includes(appName)) {
        const result = execSync(
          `osascript -e 'tell application "${appName}" to return {URL of active tab of front window, title of active tab of front window}'`,
          { encoding: "utf-8", timeout: 2000 },
        ).trim();
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
function getWindowsFrontmostApp(): string | null {
  try {
    const { execSync } = require("node:child_process");
    // Get foreground window title and process name
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
    const result = execSync(
      `powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`,
      { encoding: "utf-8", timeout: 3000 },
    ).trim();

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
function getLinuxFrontmostApp(): string | null {
  try {
    const { execSync } = require("node:child_process");
    const windowTitle = execSync("xdotool getactivewindow getwindowname", {
      encoding: "utf-8",
      timeout: 2000,
    }).trim();

    // Try to get the process name
    let processName = "";
    try {
      const pid = execSync("xdotool getactivewindow getwindowpid", {
        encoding: "utf-8",
        timeout: 2000,
      }).trim();
      processName = execSync(`cat /proc/${pid}/comm`, {
        encoding: "utf-8",
        timeout: 1000,
      }).trim();
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
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.freestyle.app");

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
      return systemPreferences.isTrustedAccessibilityClient(false);
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

  // IPC: hotkey recording via main process (captures keys the DOM can't see, e.g. fn/globe)
  let recordingListener: GlobalKeyboardListener | null = null;

  ipcMain.on("hotkey-record:start", () => {
    // Kill any existing recording listener
    if (recordingListener) {
      try {
        recordingListener.kill();
      } catch {
        /* ignore */
      }
      recordingListener = null;
    }

    // Pause the active hotkey listener so it doesn't fire during recording
    if (keyListener) {
      try {
        keyListener.kill();
      } catch {
        /* ignore */
      }
      keyListener = null;
    }

    // Ensure binary is executable / signed before starting recording listener
    ensureMacKeyServerExecutable();

    try {
      recordingListener = new GlobalKeyboardListener();
    } catch (err) {
      console.error("[hotkey] Failed to create recording listener:", err);
      settingsWindow?.webContents.send("hotkey-record:cancel");
      settingsWindow?.webContents.send("hotkey:error", {
        message:
          "Could not start the key listener for recording. " +
          "Please check Accessibility permissions in System Settings.",
      });
      // Re-register the primary hotkey listener
      registerHotkey(currentHotkeyAccel ?? undefined);
      return;
    }

    recordingListener.addListener(
      (e: IGlobalKeyEvent, isDown: IGlobalKeyDownMap) => {
        if (e.state !== "DOWN") return;

        // Build the key event payload
        const modifiers: string[] = [];
        const isMac = process.platform === "darwin";
        if (isDown["LEFT META"] || isDown["RIGHT META"]) {
          modifiers.push(isMac ? "Command" : "Control");
        }
        if (isDown["LEFT CTRL"] || isDown["RIGHT CTRL"])
          modifiers.push("Control");
        if (isDown["LEFT ALT"] || isDown["RIGHT ALT"]) modifiers.push("Alt");
        if (isDown["LEFT SHIFT"] || isDown["RIGHT SHIFT"])
          modifiers.push("Shift");
        // Deduplicate (e.g. Control from both Meta and Ctrl on non-Mac)
        const uniqueModifiers = [...new Set(modifiers)];

        // Skip if only a modifier key was pressed
        const modifierNames = [
          "LEFT META",
          "RIGHT META",
          "LEFT CTRL",
          "RIGHT CTRL",
          "LEFT ALT",
          "RIGHT ALT",
          "LEFT SHIFT",
          "RIGHT SHIFT",
        ];
        if (modifierNames.includes(e.name ?? "")) {
          // Send partial modifier state to renderer
          settingsWindow?.webContents.send(
            "hotkey-record:modifiers",
            uniqueModifiers,
          );
          return;
        }

        // Map node-global-key-listener key names to our accelerator format
        const keyMap: Record<string, string> = {
          SPACE: "Space",
          RETURN: "Return",
          ESCAPE: "Escape",
          TAB: "Tab",
          BACKSPACE: "Backspace",
          DELETE: "Delete",
          "UP ARROW": "Up",
          "DOWN ARROW": "Down",
          "LEFT ARROW": "Left",
          "RIGHT ARROW": "Right",
          FN: "Fn",
        };

        const keyName = e.name ?? "";

        // Escape cancels recording
        if (keyName === "ESCAPE") {
          settingsWindow?.webContents.send("hotkey-record:cancel");
          try {
            recordingListener?.kill();
          } catch {
            /* ignore */
          }
          recordingListener = null;
          // Re-register the hotkey listener
          registerHotkey(currentHotkeyAccel ?? undefined);
          return;
        }

        const mappedKey = keyMap[keyName] || keyName;

        // Send the captured combo to the renderer
        settingsWindow?.webContents.send("hotkey-record:captured", {
          modifiers: uniqueModifiers,
          key: mappedKey,
        });

        // Stop listening after capture (hotkey re-registered when user saves/cancels via hotkey-record:stop)
        try {
          recordingListener?.kill();
        } catch {
          /* ignore */
        }
        recordingListener = null;
      },
    );
  });

  ipcMain.on("hotkey-record:stop", () => {
    if (recordingListener) {
      try {
        recordingListener.kill();
      } catch {
        /* ignore */
      }
      recordingListener = null;
    }
    // Re-register the hotkey listener
    registerHotkey(currentHotkeyAccel ?? undefined);
  });

  // Set database path for the server before any API calls
  process.env.FREESTYLE_DB_PATH = join(app.getPath("userData"), "freestyle.db");

  // Start the Hono HTTP server with WebSocket support
  const wss = new WebSocketServer({ noServer: true });

  function startServer(port: number): void {
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

  startServer(DEFAULT_PORT);

  createTray();

  createAppWindow();

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

  if (!is.dev) {
    const autoUpdateEnabled = readSettings().autoUpdate !== false;
    autoUpdater.autoDownload = autoUpdateEnabled;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("update-available", (info) => {
      settingsWindow?.webContents.send("updater:available", {
        version: info.version,
      });
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

    autoUpdater.checkForUpdatesAndNotify();

    // Always start periodic background checking regardless of auto-update setting
    startUpdateCheckInterval();
  }

  ipcMain.on("updater:download", () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.on("updater:install", () => {
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
      return latest;
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

  // -- Context-aware dictation: get frontmost app + browser context --
  ipcMain.handle("system:frontmost-app", async () => {
    try {
      if (process.platform === "darwin") {
        return getMacFrontmostApp();
      }
      if (process.platform === "win32") {
        return getWindowsFrontmostApp();
      }
      if (process.platform === "linux") {
        return getLinuxFrontmostApp();
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
  });

  // Fix MacKeyServer binary permissions / codesign before first use
  ensureMacKeyServerExecutable();

  // Register hold-to-record hotkey via node-global-key-listener
  registerHotkey();

  // Listen for hotkey changes from the settings UI
  ipcMain.on("hotkey:update", (_event, newHotkey: string) => {
    registerHotkey(newHotkey);
  });
});

const DEFAULT_HOTKEY = "Alt+Space";

// Map Electron accelerator parts to node-global-key-listener key names
type HotkeyParts = { modifiers: Set<string>; key: string };

function parseAccelerator(accel: string): HotkeyParts {
  const parts = accel.split("+").map((p) => p.trim());
  const key = parts[parts.length - 1];
  const modifiers = new Set<string>();

  for (let i = 0; i < parts.length - 1; i++) {
    const mod = parts[i].toLowerCase();
    if (mod === "alt" || mod === "option") {
      modifiers.add("LEFT ALT");
      modifiers.add("RIGHT ALT");
    } else if (mod === "ctrl" || mod === "control") {
      modifiers.add("LEFT CTRL");
      modifiers.add("RIGHT CTRL");
    } else if (mod === "shift") {
      modifiers.add("LEFT SHIFT");
      modifiers.add("RIGHT SHIFT");
    } else if (
      mod === "meta" ||
      mod === "super" ||
      mod === "command" ||
      mod === "commandorcontrol" ||
      mod === "cmdorctrl"
    ) {
      modifiers.add("LEFT META");
      modifiers.add("RIGHT META");
    }
  }

  // Map the key part to node-global-key-listener name
  const keyMap: Record<string, string> = {
    space: "SPACE",
    enter: "RETURN",
    return: "RETURN",
    escape: "ESCAPE",
    tab: "TAB",
    backspace: "BACKSPACE",
    delete: "DELETE",
    up: "UP ARROW",
    down: "DOWN ARROW",
    left: "LEFT ARROW",
    right: "RIGHT ARROW",
    fn: "FN",
  };

  const mappedKey = keyMap[key.toLowerCase()] || key.toUpperCase();

  return { modifiers, key: mappedKey };
}

// Check if the required modifier keys are held down
function modifiersMatch(
  modifiers: Set<string>,
  isDown: IGlobalKeyDownMap,
): boolean {
  if (modifiers.size === 0) return true;

  // Group modifiers by type (left/right variants)
  const groups: string[][] = [];
  const seen = new Set<string>();

  for (const mod of modifiers) {
    if (seen.has(mod)) continue;
    // Find the paired variant
    if (mod.startsWith("LEFT ")) {
      const right = `RIGHT ${mod.slice(5)}`;
      groups.push([mod, right]);
      seen.add(mod);
      seen.add(right);
    } else if (mod.startsWith("RIGHT ")) {
      const left = `LEFT ${mod.slice(6)}`;
      groups.push([left, mod]);
      seen.add(mod);
      seen.add(left);
    } else {
      groups.push([mod]);
      seen.add(mod);
    }
  }

  // Each group must have at least one key held
  return groups.every((group) =>
    group.some((k) => isDown[k as keyof IGlobalKeyDownMap]),
  );
}

// Validate that an accelerator string is safe
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

function registerHotkey(hotkey?: string): void {
  // Tear down previous listener
  if (keyListener) {
    try {
      keyListener.kill();
    } catch {
      /* ignore */
    }
    keyListener = null;
  }
  hotkeyPressed = false;

  if (!hotkey) {
    hotkey = loadHotkeyFromDB();
  }

  const accel = hotkey && isValidAccelerator(hotkey) ? hotkey : DEFAULT_HOTKEY;
  currentHotkeyAccel = accel;
  const { modifiers, key: triggerKey } = parseAccelerator(accel);

  try {
    keyListener = new GlobalKeyboardListener();
  } catch (err) {
    console.error("[hotkey] Failed to create GlobalKeyboardListener:", err);
    keyListener = null;
    const errorPayload = {
      message:
        "Could not start the global key listener. " +
        "Please check that Accessibility permissions are granted in " +
        "System Settings > Privacy & Security > Accessibility.",
    };
    mainWindow?.webContents.send("hotkey:error", errorPayload);
    settingsWindow?.webContents.send("hotkey:error", errorPayload);
    return;
  }

  const listener = (
    e: IGlobalKeyEvent,
    isDown: IGlobalKeyDownMap,
  ): boolean | undefined => {
    if (e.name !== triggerKey) return undefined;

    if (e.state === "DOWN" && !hotkeyPressed) {
      // Check modifiers match
      if (!modifiersMatch(modifiers, isDown)) return undefined;

      hotkeyPressed = true;
      showPill();
      mainWindow?.webContents.send("hotkey:down");
      // Suppress the key event so other apps don't receive it
      return true;
    } else if (e.state === "UP" && hotkeyPressed) {
      hotkeyPressed = false;
      mainWindow?.webContents.send("hotkey:up");
      return true;
    }

    return undefined;
  };

  try {
    keyListener.addListener(listener);
  } catch (err) {
    console.error("[hotkey] Failed to add key listener:", err);
    keyListener = null;
    const errorPayload = {
      message: "Failed to register the hotkey listener.",
    };
    mainWindow?.webContents.send("hotkey:error", errorPayload);
    settingsWindow?.webContents.send("hotkey:error", errorPayload);
  }
}

// Clean up key listener on quit
app.on("will-quit", () => {
  if (keyListener) {
    try {
      keyListener.kill();
    } catch {
      /* ignore */
    }
    keyListener = null;
  }
});

// Keep app running in background when windows are closed (tray stays active)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // On non-macOS, keep the app alive for the tray
    // Only quit explicitly via tray menu
  }
});

// Gracefully shut down the HTTP server before quitting
app.on("before-quit", () => {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
});
