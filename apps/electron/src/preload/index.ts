import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";

// Custom APIs for renderer
const api = {
  pasteText: (text: string): Promise<void> =>
    ipcRenderer.invoke("paste:text", text),
  updateHotkey: (hotkey: string): void =>
    ipcRenderer.send("hotkey:update", hotkey),
  hidePill: (): void => ipcRenderer.send("pill:hide"),
  getServerPort: (): Promise<number> => ipcRenderer.invoke("server:port"),
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
  checkMicPermission: (): Promise<string> =>
    ipcRenderer.invoke("permissions:check-mic"),
  requestMicPermission: (): Promise<string> =>
    ipcRenderer.invoke("permissions:request-mic"),
  checkAccessibilityPermission: (): Promise<boolean> =>
    ipcRenderer.invoke("permissions:check-accessibility"),
  openAccessibilitySettings: (): void =>
    ipcRenderer.send("permissions:open-accessibility"),
  openMicSettings: (): void =>
    ipcRenderer.send("permissions:open-mic-settings"),
  getOnboardingComplete: (): Promise<boolean> =>
    ipcRenderer.invoke("onboarding:complete"),
  setOnboardingComplete: (): void =>
    ipcRenderer.send("onboarding:set-complete"),
  startHotkeyRecording: (): void => ipcRenderer.send("hotkey-record:start"),
  stopHotkeyRecording: (): void => ipcRenderer.send("hotkey-record:stop"),
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
  onHotkeyRecordCancel: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("hotkey-record:cancel", handler);
    return () => ipcRenderer.removeListener("hotkey-record:cancel", handler);
  },
  // Auto-updater
  checkForUpdate: (): Promise<string | null> =>
    ipcRenderer.invoke("updater:check"),
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
  // Auto-update setting
  getAutoUpdate: (): Promise<boolean> =>
    ipcRenderer.invoke("settings:auto-update"),
  setAutoUpdate: (enabled: boolean): void =>
    ipcRenderer.send("settings:set-auto-update", enabled),
  // Context-aware dictation
  getFrontmostApp: (): Promise<string | null> =>
    ipcRenderer.invoke("system:frontmost-app"),
  // Pill position
  getPillPosition: (): Promise<string> =>
    ipcRenderer.invoke("settings:pill-position"),
  setPillPosition: (position: string): void =>
    ipcRenderer.send("settings:set-pill-position", position),
  // Hotkey error notifications
  onHotkeyError: (
    callback: (error: { message: string }) => void,
  ): (() => void) => {
    const handler = (_: unknown, error: { message: string }): void =>
      callback(error);
    ipcRenderer.on("hotkey:error", handler);
    return () => ipcRenderer.removeListener("hotkey:error", handler);
  },
  // Debug: forward renderer logs to main process console (dev only)
  debugLog: (...args: unknown[]): void =>
    ipcRenderer.send("debug:log", ...args),
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
