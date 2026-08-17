import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";
import type { ActiveAudioPlaybackMode } from "../shared/audio-playback";
import type { CompanionForm, CompanionState } from "../shared/companion";
import type {
  RemixContextResult,
  RemixCopyResult,
  RemixPrimitiveResult,
  RemixReadDocumentResult,
} from "../shared/remix";
import type { SpriteEvent } from "../shared/sprite-events";

// Custom APIs for renderer
const api = {
  // The renderer can't reach process.platform reliably (navigator.platform
  // is deprecated); expose it once here so all platform checks agree.
  platform: process.platform as string,
  pasteText: (text: string, appContext?: string | null): Promise<void> =>
    ipcRenderer.invoke("paste:text", text, appContext ?? null),
  copyText: (text: string, appContext?: string | null): Promise<void> =>
    ipcRenderer.invoke("copy:text", text, appContext ?? null),
  prepareSystemAudio: (mode: ActiveAudioPlaybackMode): Promise<void> =>
    ipcRenderer.invoke("audio:prepare", mode),
  restoreSystemAudio: (): Promise<void> => ipcRenderer.invoke("audio:restore"),
  getServerPort: (): Promise<number> => ipcRenderer.invoke("server:port"),
  // Configured external server URL/token ("" = built-in local server / no auth).
  getServerUrl: (): Promise<string> => ipcRenderer.invoke("server:url"),
  getServerToken: (): Promise<string> => ipcRenderer.invoke("server:token"),
  // Reveal the diagnostic logs folder (freestyle.log) in the OS file manager.
  openLogsFolder: (): Promise<boolean> =>
    ipcRenderer.invoke("logs:open-folder"),
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("open:external", url),
  onTalkDown: (cb: () => void) => {
    const listener = (): void => cb();
    ipcRenderer.on("talk:down", listener);
    return () => ipcRenderer.removeListener("talk:down", listener);
  },
  onTalkUp: (cb: () => void) => {
    const listener = (): void => cb();
    ipcRenderer.on("talk:up", listener);
    return () => ipcRenderer.removeListener("talk:up", listener);
  },
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
  onDictationCancel: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("dictation:cancel", handler);
    return () => ipcRenderer.removeListener("dictation:cancel", handler);
  },
  setDictationPhase: (phase: "idle" | "recording" | "transcribing"): void =>
    ipcRenderer.send("dictation:state", phase),
  // --- Remix ---
  reloadRemixHotkey: (): void => ipcRenderer.send("remix-hotkey:reload"),
  // --- Remix primitives (the agent's tools; workflow lives in its prompt) ---
  remixGetContext: (): Promise<RemixContextResult> =>
    ipcRenderer.invoke("remix:get-context"),
  remixReadDocument: (): Promise<RemixReadDocumentResult> =>
    ipcRenderer.invoke("remix:read-document"),
  remixSetClipboard: (text: string): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:set-clipboard", text),
  remixPasteClipboard: (): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:paste-clipboard"),
  remixGetClipboard: (): Promise<RemixCopyResult> =>
    ipcRenderer.invoke("remix:get-clipboard"),
  companionForm: (): Promise<CompanionForm> =>
    ipcRenderer.invoke("companion:form"),
  companionSetHotRect: (
    rect: { x: number; y: number; width: number; height: number } | null,
  ): void => ipcRenderer.send("companion:set-hot-rect", rect),
  companionHover: (): void => ipcRenderer.send("companion:hover"),
  setCompanionForm: (form: CompanionForm): void =>
    ipcRenderer.send("companion:set-form", form),
  panelOpenForDictation: (): void =>
    ipcRenderer.send("panel:open-for-dictation"),
  panelDictationPartial: (text: string): void =>
    ipcRenderer.send("panel:dictation-partial", text),
  panelDictationFinal: (text: string): void =>
    ipcRenderer.send("panel:dictation-final", text),
  panelDictationError: (message: string): void =>
    ipcRenderer.send("panel:dictation-error", message),
  onPanelDictation: (
    callback: (ev: {
      kind: "partial" | "final" | "error";
      text: string;
    }) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      ev: { kind: "partial" | "final" | "error"; text: string },
    ): void => callback(ev);
    ipcRenderer.on("panel:dictation", handler);
    return () => ipcRenderer.removeListener("panel:dictation", handler);
  },
  dictationPrefs: (): Promise<{
    destination: "cursor" | "composer";
    outputMode: "paste" | "clipboard";
    soundEnabled: boolean;
    audioPlaybackMode: "off" | "duck" | "pause";
  }> => ipcRenderer.invoke("dictation:prefs"),
  onDictationPrefs: (
    callback: (prefs: {
      destination: "cursor" | "composer";
      outputMode: "paste" | "clipboard";
    }) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      prefs: {
        destination: "cursor" | "composer";
        outputMode: "paste" | "clipboard";
        soundEnabled: boolean;
        audioPlaybackMode: "off" | "duck" | "pause";
      },
    ): void => callback(prefs);
    ipcRenderer.on("dictation:prefs", handler);
    return () => ipcRenderer.removeListener("dictation:prefs", handler);
  },
  reloadDictationPrefs: (): void => ipcRenderer.send("dictation:reload-prefs"),
  panelClose: (): void => ipcRenderer.send("panel:close"),
  panelSetBusy: (busy: boolean): void =>
    ipcRenderer.send("panel:set-busy", busy),
  panelRequestFocus: (): void => ipcRenderer.send("panel:request-focus"),
  panelPointerLeft: (): void => ipcRenderer.send("panel:pointer-left"),
  panelPointerEntered: (): void => ipcRenderer.send("panel:pointer-entered"),
  onPanelFocusComposer: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("panel:focus-composer", handler);
    return () => ipcRenderer.removeListener("panel:focus-composer", handler);
  },
  notificationsList: (): Promise<unknown[]> =>
    ipcRenderer.invoke("notifications:list"),
  notificationDismiss: (id: string): void =>
    ipcRenderer.send("notifications:dismiss", id),
  notificationOpen: (id: string): void =>
    ipcRenderer.send("notifications:open", id),
  notificationSetHeight: (height: number): void =>
    ipcRenderer.send("notifications:set-height", height),
  notificationSetHovered: (hovering: boolean): void =>
    ipcRenderer.send("notifications:hover", hovering),
  onNotificationsChanged: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("notifications:changed", handler);
    return () => ipcRenderer.removeListener("notifications:changed", handler);
  },
  agentTurnFinished: (payload: { threadId: string; excerpt: string }): void =>
    ipcRenderer.send("agent:turn-finished", payload),
  onPanelOpenThread: (callback: (threadId: string) => void): (() => void) => {
    const handler = (_e: unknown, threadId: string): void => callback(threadId);
    ipcRenderer.on("panel:open-thread", handler);
    return () => ipcRenderer.removeListener("panel:open-thread", handler);
  },
  onPanelShowSettings: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("panel:show-settings", handler);
    return () => ipcRenderer.removeListener("panel:show-settings", handler);
  },
  onCompanionForm: (callback: (form: CompanionForm) => void): (() => void) => {
    const handler = (_e: unknown, form: CompanionForm): void => callback(form);
    ipcRenderer.on("companion:form", handler);
    return () => ipcRenderer.removeListener("companion:form", handler);
  },
  onCompanionState: (
    callback: (state: CompanionState) => void,
  ): (() => void) => {
    const handler = (_e: unknown, state: CompanionState): void =>
      callback(state);
    ipcRenderer.on("companion:state", handler);
    return () => ipcRenderer.removeListener("companion:state", handler);
  },
  onCompanionHotEnter: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("companion:hot-enter", handler);
    return () => ipcRenderer.removeListener("companion:hot-enter", handler);
  },
  spriteEvent: (ev: SpriteEvent): void => ipcRenderer.send("sprite:event", ev),
  spritePerformSync: (payload: {
    name: string;
    toolClass: string;
  }): Promise<boolean> => ipcRenderer.invoke("sprite:perform-sync", payload),
  spriteImpact: (nonce: string): void =>
    ipcRenderer.send("sprite:impact", nonce),
  spritePerformDone: (nonce: string): void =>
    ipcRenderer.send("sprite:perform-done", nonce),
  onSpriteEvent: (callback: (ev: SpriteEvent) => void): (() => void) => {
    const handler = (_e: unknown, ev: SpriteEvent): void => callback(ev);
    ipcRenderer.on("companion:sprite-event", handler);
    return () => ipcRenderer.removeListener("companion:sprite-event", handler);
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
  startHotkeyRecording: (): void => ipcRenderer.send("hotkey-record:start"),
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
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  // Auto-updater
  checkForUpdate: (): Promise<{
    version: string;
    downloadState: string;
  } | null> => ipcRenderer.invoke("updater:check"),
  downloadUpdate: (): void => ipcRenderer.send("updater:download"),
  installUpdate: (): void => ipcRenderer.send("updater:install"),
  getUpdateStatus: (): Promise<{
    version: string | null;
    downloadState: "idle" | "downloading" | "downloaded";
  }> => ipcRenderer.invoke("updater:status"),
  onUpdateStatus: (
    callback: (status: {
      version: string | null;
      downloadState: "idle" | "downloading" | "downloaded";
    }) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      status: {
        version: string | null;
        downloadState: "idle" | "downloading" | "downloaded";
      },
    ): void => callback(status);
    ipcRenderer.on("updater:status", handler);
    return () => ipcRenderer.removeListener("updater:status", handler);
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
  // Context-aware dictation
  getFrontmostApp: (): Promise<string | null> =>
    ipcRenderer.invoke("system:frontmost-app"),
  // Fired by the pill after a successful transcription + paste, so other
  // windows (Today, History) can refetch without polling.
  sendTranscriptionDone: (): void => ipcRenderer.send("transcription:done"),
  onTranscriptionDone: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("transcription:done", handler);
    return () => ipcRenderer.removeListener("transcription:done", handler);
  },

  invalidatePluginView: (): void => ipcRenderer.send("plugin-view:invalidate"),
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
