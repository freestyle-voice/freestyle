import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";
import type {
  ActiveAudioPlaybackMode,
  AudioPlaybackMode,
} from "../shared/audio-playback";
import { getDefaultHotkey } from "../shared/hotkey-defaults";
import type {
  PluginCatalogEntry,
  PluginInfo,
  PluginViewBounds,
} from "../shared/plugins";

// Custom APIs for renderer
const api = {
  // The renderer can't reach process.platform reliably (navigator.platform
  // is deprecated); expose it once here so all platform checks agree.
  platform: process.platform as string,
  isE2E: process.env.FREESTYLE_E2E === "1",
  defaultHotkey: getDefaultHotkey(),
  pasteText: (text: string, appContext?: string | null): Promise<void> =>
    ipcRenderer.invoke("paste:text", text, appContext ?? null),
  copyText: (text: string, appContext?: string | null): Promise<void> =>
    ipcRenderer.invoke("copy:text", text, appContext ?? null),
  prepareSystemAudio: (mode: ActiveAudioPlaybackMode): Promise<void> =>
    ipcRenderer.invoke("audio:prepare", mode),
  duckSystemAudio: (): Promise<void> => ipcRenderer.invoke("audio:duck"),
  restoreSystemAudio: (): Promise<void> => ipcRenderer.invoke("audio:restore"),
  updateHotkey: (hotkey: string): void =>
    ipcRenderer.send("hotkey:update", hotkey),
  reloadHotkey: (): void => ipcRenderer.send("hotkey:reload"),
  setHotkeyMode: (mode: "hold" | "toggle"): void =>
    ipcRenderer.send("hotkey:set-mode", mode),
  hidePill: (): void => ipcRenderer.send("pill:hide"),
  showErrorDialog: (title: string, message: string): Promise<void> =>
    ipcRenderer.invoke("dialog:show-error", title, message),
  getServerPort: (): Promise<number> => ipcRenderer.invoke("server:port"),
  // Reveal the diagnostic logs folder (freestyle.log) in the OS file manager.
  openLogsFolder: (): Promise<boolean> =>
    ipcRenderer.invoke("logs:open-folder"),
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("open:external", url),
  cloudPromptSignIn: (): Promise<boolean> =>
    ipcRenderer.invoke("cloud:prompt-sign-in"),
  onHotkeyDown: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("hotkey:down", handler);
    return () => ipcRenderer.removeListener("hotkey:down", handler);
  },
  onHotkeyUp: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("hotkey:up", handler);
    return () => ipcRenderer.removeListener("hotkey:up", handler);
  },
  onPillCancel: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("pill:cancel", handler);
    return () => ipcRenderer.removeListener("pill:cancel", handler);
  },
  checkMicPermission: (): Promise<string> =>
    ipcRenderer.invoke("permissions:check-mic"),
  requestMicPermission: (): Promise<string> =>
    ipcRenderer.invoke("permissions:request-mic"),
  checkAccessibilityPermission: (): Promise<boolean> =>
    ipcRenderer.invoke("permissions:check-accessibility"),
  checkLinuxSetup: (): Promise<{
    wayland: boolean;
    inputAccess: boolean;
    pasteToolRequired: string;
    pasteTool: string | null;
  } | null> => ipcRenderer.invoke("permissions:check-linux-setup"),
  openAccessibilitySettings: (): void =>
    ipcRenderer.send("permissions:open-accessibility"),
  openMicSettings: (): void =>
    ipcRenderer.send("permissions:open-mic-settings"),
  getOnboardingComplete: (): Promise<boolean> =>
    ipcRenderer.invoke("onboarding:complete"),
  setOnboardingComplete: (): void =>
    ipcRenderer.send("onboarding:set-complete"),
  startHotkeyRecording: (): void => ipcRenderer.send("hotkey-record:start"),
  pauseHotkeyRecording: (): void =>
    ipcRenderer.send("hotkey-record:pause-recorder"),
  stopHotkeyRecording: (hotkey?: string): void =>
    ipcRenderer.send("hotkey-record:stop", hotkey),
  onHotkeyRecordModifiers: (
    callback: (modifiers: string[]) => void,
  ): (() => void) => {
    const handler = (_: unknown, modifiers: string[]): void =>
      callback(modifiers);
    ipcRenderer.on("hotkey-record:modifiers", handler);
    return () => ipcRenderer.removeListener("hotkey-record:modifiers", handler);
  },
  onHotkeyRecordCaptured: (
    callback: (combo: { modifiers: string[]; key: string }) => void,
  ): (() => void) => {
    const handler = (
      _: unknown,
      combo: { modifiers: string[]; key: string },
    ): void => callback(combo);
    ipcRenderer.on("hotkey-record:captured", handler);
    return () => ipcRenderer.removeListener("hotkey-record:captured", handler);
  },
  onHotkeyRecordReleased: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("hotkey-record:released", handler);
    return () => ipcRenderer.removeListener("hotkey-record:released", handler);
  },
  onHotkeyRecordCancel: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("hotkey-record:cancel", handler);
    return () => ipcRenderer.removeListener("hotkey-record:cancel", handler);
  },
  // Auto-updater
  checkForUpdate: (): Promise<{
    version: string;
    downloadState: string;
  } | null> => ipcRenderer.invoke("updater:check"),
  downloadUpdate: (): void => ipcRenderer.send("updater:download"),
  installUpdate: (): void => ipcRenderer.send("updater:install"),
  onUpdateAvailable: (
    callback: (info: { version: string }) => void,
  ): (() => void) => {
    const handler = (_: unknown, info: { version: string }): void =>
      callback(info);
    ipcRenderer.on("updater:available", handler);
    return () => ipcRenderer.removeListener("updater:available", handler);
  },
  onUpdateDownloaded: (
    callback: (info: { version: string }) => void,
  ): (() => void) => {
    const handler = (_: unknown, info: { version: string }): void =>
      callback(info);
    ipcRenderer.on("updater:downloaded", handler);
    return () => ipcRenderer.removeListener("updater:downloaded", handler);
  },
  onUpdateDownloading: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("updater:downloading", handler);
    return () => ipcRenderer.removeListener("updater:downloading", handler);
  },
  onUpdateError: (
    callback: (info: { message: string }) => void,
  ): (() => void) => {
    const handler = (_: unknown, info: { message: string }): void =>
      callback(info);
    ipcRenderer.on("updater:error", handler);
    return () => ipcRenderer.removeListener("updater:error", handler);
  },
  // Auto-update setting
  getAutoUpdate: (): Promise<boolean> =>
    ipcRenderer.invoke("settings:auto-update"),
  setAutoUpdate: (enabled: boolean): void =>
    ipcRenderer.send("settings:set-auto-update", enabled),
  // Launch at startup setting
  getLaunchAtStartup: (): Promise<boolean> =>
    ipcRenderer.invoke("settings:launch-at-startup"),
  setLaunchAtStartup: (enabled: boolean): void =>
    ipcRenderer.send("settings:set-launch-at-startup", enabled),
  // Show dashboard on launch setting
  getShowDashboardOnLaunch: (): Promise<boolean> =>
    ipcRenderer.invoke("settings:show-dashboard-on-launch"),
  setShowDashboardOnLaunch: (enabled: boolean): void =>
    ipcRenderer.send("settings:set-show-dashboard-on-launch", enabled),
  // Context-aware dictation
  getFrontmostApp: (): Promise<string | null> =>
    ipcRenderer.invoke("system:frontmost-app"),
  // Pill position
  getPillPosition: (): Promise<string> =>
    ipcRenderer.invoke("settings:pill-position"),
  setPillPosition: (position: string): void =>
    ipcRenderer.send("settings:set-pill-position", position),
  onPillPositionChanged: (
    callback: (position: string) => void,
  ): (() => void) => {
    const handler = (_: unknown, position: string): void => callback(position);
    ipcRenderer.on("settings:pill-position-changed", handler);
    return () =>
      ipcRenderer.removeListener("settings:pill-position-changed", handler);
  },
  // Output mode
  sendOutputModeChanged: (mode: string): void =>
    ipcRenderer.send("settings:output-mode-changed", mode),
  onOutputModeChanged: (callback: (mode: string) => void): (() => void) => {
    const handler = (_: unknown, mode: string): void => callback(mode);
    ipcRenderer.on("settings:output-mode-changed", handler);
    return () =>
      ipcRenderer.removeListener("settings:output-mode-changed", handler);
  },
  sendAudioDuckingChanged: (enabled: boolean): void =>
    ipcRenderer.send("settings:audio-ducking-changed", enabled),
  onAudioDuckingChanged: (
    callback: (enabled: boolean) => void,
  ): (() => void) => {
    const handler = (_: unknown, enabled: boolean): void => callback(enabled);
    ipcRenderer.on("settings:audio-ducking-changed", handler);
    return () =>
      ipcRenderer.removeListener("settings:audio-ducking-changed", handler);
  },
  sendAudioPlaybackModeChanged: (mode: AudioPlaybackMode): void =>
    ipcRenderer.send("settings:audio-playback-mode-changed", mode),
  onAudioPlaybackModeChanged: (
    callback: (mode: AudioPlaybackMode) => void,
  ): (() => void) => {
    const handler = (_: unknown, mode: AudioPlaybackMode): void =>
      callback(mode);
    ipcRenderer.on("settings:audio-playback-mode-changed", handler);
    return () =>
      ipcRenderer.removeListener(
        "settings:audio-playback-mode-changed",
        handler,
      );
  },
  // Hotkey error notifications
  onHotkeyError: (
    callback: (error: { message: string }) => void,
  ): (() => void) => {
    const handler = (_: unknown, error: { message: string }): void =>
      callback(error);
    ipcRenderer.on("hotkey:error", handler);
    return () => ipcRenderer.removeListener("hotkey:error", handler);
  },
  // Audio level stream — pill broadcasts per-frame mic amplitude (0..1) so
  // other windows (the Today tutorial demo) can render a live waveform.
  sendAudioLevel: (level: number): void =>
    ipcRenderer.send("audio:level", level),
  onAudioLevel: (callback: (level: number) => void): (() => void) => {
    const handler = (_: unknown, level: number): void => callback(level);
    ipcRenderer.on("audio:level", handler);
    return () => ipcRenderer.removeListener("audio:level", handler);
  },
  // Fired by the pill after a successful transcription + paste, so other
  // windows (Today, History) can refetch without polling.
  sendTranscriptionDone: (): void => ipcRenderer.send("transcription:done"),
  sendRecordingCommitted: (): void => ipcRenderer.send("recording:committed"),
  sendRecordingCancelled: (): void => ipcRenderer.send("recording:cancelled"),
  onTranscriptionDone: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("transcription:done", handler);
    return () => ipcRenderer.removeListener("transcription:done", handler);
  },
  // Fullscreen state
  onFullscreenChanged: (
    callback: (isFullscreen: boolean) => void,
  ): (() => void) => {
    const handler = (_: unknown, isFullscreen: boolean): void =>
      callback(isFullscreen);
    ipcRenderer.on("fullscreen:changed", handler);
    return () => ipcRenderer.removeListener("fullscreen:changed", handler);
  },
  // Microphone activity detection
  onMicActivityChanged: (
    callback: (state: "active" | "inactive" | "unknown") => void,
  ): (() => void) => {
    const handler = (
      _: unknown,
      state: "active" | "inactive" | "unknown",
    ): void => callback(state);
    ipcRenderer.on("mic:activity-changed", handler);
    return () => ipcRenderer.removeListener("mic:activity-changed", handler);
  },

  // --- Plugins ---
  listPlugins: (): Promise<PluginInfo[]> => ipcRenderer.invoke("plugins:list"),
  refreshPlugins: (): Promise<PluginInfo[]> =>
    ipcRenderer.invoke("plugins:refresh"),
  setPluginEnabled: (
    specifier: string,
    enabled: boolean,
  ): Promise<PluginInfo[]> =>
    ipcRenderer.invoke("plugins:set-enabled", specifier, enabled),
  getPluginCatalog: (): Promise<{ plugins: PluginCatalogEntry[] }> =>
    ipcRenderer.invoke("plugins:catalog"),
  installPlugin: (npmName: string, version?: string): Promise<PluginInfo[]> =>
    ipcRenderer.invoke("plugins:install", npmName, version),
  uninstallPlugin: (specifier: string): Promise<PluginInfo[]> =>
    ipcRenderer.invoke("plugins:uninstall", specifier),
  showPluginView: (
    slug: string,
    pageId: string,
    bounds: PluginViewBounds,
    tokens?: Record<string, string>,
  ): Promise<boolean> =>
    ipcRenderer.invoke("plugin-view:show", slug, pageId, bounds, tokens),
  setPluginViewBounds: (bounds: PluginViewBounds): void =>
    ipcRenderer.send("plugin-view:set-bounds", bounds),
  hidePluginView: (): void => ipcRenderer.send("plugin-view:hide"),
  onPluginNavigate: (callback: (to: string) => void): (() => void) => {
    const handler = (_: unknown, to: string): void => callback(to);
    ipcRenderer.on("plugin:navigate", handler);
    return () => ipcRenderer.removeListener("plugin:navigate", handler);
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI;
  // @ts-expect-error (define in dts)
  window.api = api;
}
