import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";
import type { ActiveAudioPlaybackMode } from "../shared/audio-playback";
import type { CompanionForm, CompanionState } from "../shared/companion";
import type { DictationPrefs } from "../shared/dictation-prefs";
import { getDefaultHotkey } from "../shared/hotkey-defaults";
import type { PetState } from "../shared/pet";
import type {
  RemixContextResult,
  RemixCopyResult,
  RemixPrimitiveResult,
  RemixReadDocumentResult,
} from "../shared/remix";
import { getDefaultRemixHotkey } from "../shared/remix";
import type { SpriteEvent } from "../shared/sprite-events";

// Custom APIs for renderer
const api = {
  // The renderer can't reach process.platform reliably (navigator.platform
  // is deprecated); expose it once here so all platform checks agree.
  platform: process.platform as string,
  // Legacy-pill bridge. These are the original channels, retained by the main
  // process while the current renderer contracts are progressively moved into
  // the restored visual shell.
  isE2E: process.env.FREESTYLE_E2E === "1",
  defaultHotkey: getDefaultHotkey(),
  defaultRemixHotkey: getDefaultRemixHotkey(),
  updateHotkey: (hotkey: string): void =>
    ipcRenderer.send("hotkey:update", hotkey),
  reloadHotkey: (): void => ipcRenderer.send("hotkey:reload"),
  hidePill: (): void => ipcRenderer.send("pill:hide"),
  setPillExpanded: (
    expanded: boolean,
    expansion?: "card" | "remix-chat",
  ): void => ipcRenderer.send("pill:set-expanded", expanded, expansion),
  setPillHotRect: (
    rect: { x: number; y: number; width: number; height: number } | null,
  ): void => ipcRenderer.send("pill:set-hot-rect", rect),
  onPillHotEnter: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("pill:hot-enter", handler);
    return () => ipcRenderer.removeListener("pill:hot-enter", handler);
  },
  onPillCancel: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("pill:cancel", handler);
    return () => ipcRenderer.removeListener("pill:cancel", handler);
  },
  showErrorDialog: (title: string, message: string): Promise<void> =>
    ipcRenderer.invoke("dialog:show-error", title, message),
  setServerUrl: (url: string): Promise<string> =>
    ipcRenderer.invoke("server:set-url", url),
  setServerToken: (token: string): Promise<string> =>
    ipcRenderer.invoke("server:set-token", token),
  cloudPromptSignIn: (): Promise<boolean> =>
    ipcRenderer.invoke("cloud:prompt-sign-in"),
  cloudPromptUpgrade: (): Promise<boolean> =>
    ipcRenderer.invoke("cloud:prompt-upgrade"),
  pasteRemixResult: (text: string): Promise<boolean> =>
    ipcRenderer.invoke("remix:paste", text),
  onRemixDown: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("remix:down", handler);
    return () => ipcRenderer.removeListener("remix:down", handler);
  },
  onRemixUp: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("remix:up", handler);
    return () => ipcRenderer.removeListener("remix:up", handler);
  },
  onRemixSelection: (
    callback: (payload: {
      text: string | null;
      appName: string | null;
      windowTitle: string | null;
      capturedAt: number;
    }) => void,
  ): (() => void) => {
    const handler = (
      _: unknown,
      payload: Parameters<typeof callback>[0],
    ): void => callback(payload);
    ipcRenderer.on("remix:selection", handler);
    return () => ipcRenderer.removeListener("remix:selection", handler);
  },
  onRemixRoute: (callback: (index: number) => void): (() => void) => {
    const handler = (_: unknown, index: number): void => callback(index);
    ipcRenderer.on("remix:route", handler);
    return () => ipcRenderer.removeListener("remix:route", handler);
  },
  onRemixSupersede: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("remix:supersede", handler);
    return () => ipcRenderer.removeListener("remix:supersede", handler);
  },
  onRemixOpenChat: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("remix:open-chat", handler);
    return () => ipcRenderer.removeListener("remix:open-chat", handler);
  },
  remixRecapture: (): Promise<unknown> => ipcRenderer.invoke("remix:recapture"),
  remixSelectAll: (): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:select-all"),
  remixSelectText: (text: string, occurrence?: number): Promise<unknown> =>
    ipcRenderer.invoke("remix:select-text", text, occurrence),
  remixCollapseSelection: (): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:collapse-selection"),
  remixCopy: (): Promise<RemixCopyResult> => ipcRenderer.invoke("remix:copy"),
  remixSetClipboardImage: (url: string): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:set-clipboard-image", url),
  remixUndo: (): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:undo"),
  remixRedo: (): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:redo"),
  remixPressKey: (key: string, times?: number): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:press-key", key, times),
  remixPasteText: (text: string): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:paste-text", text),
  setRemixChatFocus: (focus: boolean): void =>
    ipcRenderer.send("remix:set-chat-focus", focus),
  setRemixRouteKeys: (open: boolean): void =>
    ipcRenderer.send("remix:set-route-keys", open),
  remixBarHover: (): void => ipcRenderer.send("remix:bar-hover"),
  pasteText: (text: string, appContext?: string | null): Promise<void> =>
    ipcRenderer.invoke("paste:text", text, appContext ?? null),
  copyText: (text: string, appContext?: string | null): Promise<void> =>
    ipcRenderer.invoke("copy:text", text, appContext ?? null),
  requestAgentFileSaveGrant: (input: {
    toolCallId: string;
    filename: string;
    content: string;
  }): Promise<{ ok: boolean; grant?: string; reason?: string }> =>
    ipcRenderer.invoke("agent:grant-file-save", input),
  saveAgentFile: (input: {
    toolCallId: string;
    filename: string;
    content: string;
    grant: string;
  }): Promise<{ ok: boolean; path?: string; reason?: string }> =>
    ipcRenderer.invoke("agent:save-file", input),
  prepareSystemAudio: (mode: ActiveAudioPlaybackMode): Promise<void> =>
    ipcRenderer.invoke("audio:prepare", mode),
  restoreSystemAudio: (): Promise<void> => ipcRenderer.invoke("audio:restore"),
  getServerPort: (): Promise<number> => ipcRenderer.invoke("server:port"),
  // Configured external server URL/token ("" = built-in local server / no auth).
  getServerUrl: (): Promise<string> => ipcRenderer.invoke("server:url"),
  getServerToken: (): Promise<string> => ipcRenderer.invoke("server:token"),
  onServerChanged: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("server:changed", handler);
    return () => ipcRenderer.removeListener("server:changed", handler);
  },
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
  onHotkeyError: (callback: (message: string) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { message: string },
    ): void => callback(payload.message);
    ipcRenderer.on("hotkey:error", handler);
    return () => ipcRenderer.removeListener("hotkey:error", handler);
  },
  setHotkeyMode: (mode: "hold" | "toggle"): void =>
    ipcRenderer.send("hotkey:set-mode", mode),
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
  petEnabled: (): Promise<boolean> => ipcRenderer.invoke("pet:enabled"),
  setPetEnabled: (enabled: boolean): void =>
    ipcRenderer.send("pet:set-enabled", enabled),
  setPetState: (state: PetState): void =>
    ipcRenderer.send("pet:set-state", state),
  companionSetHotRect: (
    rect: { x: number; y: number; width: number; height: number } | null,
  ): void => ipcRenderer.send("companion:set-hot-rect", rect),
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
  panelRendererReady: (): void => ipcRenderer.send("panel:renderer-ready"),
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
  dictationPrefs: (): Promise<DictationPrefs> =>
    ipcRenderer.invoke("dictation:prefs"),
  onDictationPrefs: (
    callback: (prefs: DictationPrefs) => void,
  ): (() => void) => {
    const handler = (_e: unknown, prefs: DictationPrefs): void =>
      callback(prefs);
    ipcRenderer.on("dictation:prefs", handler);
    return () => ipcRenderer.removeListener("dictation:prefs", handler);
  },
  reloadDictationPrefs: (): void => ipcRenderer.send("dictation:reload-prefs"),
  panelClose: (): void => ipcRenderer.send("panel:close"),
  panelResizeWidth: (width: number): void =>
    ipcRenderer.send("panel:resize-width", width),
  panelCommitWidth: (): void => ipcRenderer.send("panel:commit-width"),
  openSettings: (): void => ipcRenderer.send("settings:open"),
  settingsClose: (): void => ipcRenderer.send("settings:close"),
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
  notificationPresent: (payload: {
    messageId: string;
    title: string;
    body: string;
  }): void => ipcRenderer.send("notifications:present", payload),
  notificationSetVisible: (visible: boolean): void =>
    ipcRenderer.send("notifications:set-visible", visible),
  notificationSetHeight: (height: number): void =>
    ipcRenderer.send("notifications:set-height", height),
  notificationOpenThread: (threadId: string): void =>
    ipcRenderer.send("notifications:open-thread", threadId),
  notificationAuthChanged: (): void =>
    ipcRenderer.send("notifications:auth-changed"),
  onNotificationAuthChanged: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("notifications:auth-changed", handler);
    return () =>
      ipcRenderer.removeListener("notifications:auth-changed", handler);
  },
  onNotificationNativeClick: (
    callback: (messageId: string) => void,
  ): (() => void) => {
    const handler = (_event: unknown, messageId: string): void =>
      callback(messageId);
    ipcRenderer.on("notifications:native-click", handler);
    return () =>
      ipcRenderer.removeListener("notifications:native-click", handler);
  },
  onPanelOpenThread: (callback: (threadId: string) => void): (() => void) => {
    const handler = (_e: unknown, threadId: string): void => callback(threadId);
    ipcRenderer.on("panel:open-thread", handler);
    return () => ipcRenderer.removeListener("panel:open-thread", handler);
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

  getOpenAppCandidates: (): Promise<unknown[]> =>
    ipcRenderer.invoke("system:open-app-candidates"),
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
  sendOutputModeChanged: (mode: string): void =>
    ipcRenderer.send("settings:output-mode-changed", mode),
  onOutputModeChanged: (callback: (mode: string) => void): (() => void) => {
    const handler = (_: unknown, mode: string): void => callback(mode);
    ipcRenderer.on("settings:output-mode-changed", handler);
    return () =>
      ipcRenderer.removeListener("settings:output-mode-changed", handler);
  },
  sendPillCancelModeChanged: (mode: "always" | "hover"): void =>
    ipcRenderer.send("settings:pill-cancel-mode-changed", mode),
  onPillCancelModeChanged: (
    callback: (mode: "always" | "hover") => void,
  ): (() => void) => {
    const handler = (_: unknown, mode: "always" | "hover"): void =>
      callback(mode);
    ipcRenderer.on("settings:pill-cancel-mode-changed", handler);
    return () =>
      ipcRenderer.removeListener("settings:pill-cancel-mode-changed", handler);
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
  sendAudioPlaybackModeChanged: (mode: string): void =>
    ipcRenderer.send("settings:audio-playback-mode-changed", mode),
  onAudioPlaybackModeChanged: (
    callback: (mode: string) => void,
  ): (() => void) => {
    const handler = (_: unknown, mode: string): void => callback(mode);
    ipcRenderer.on("settings:audio-playback-mode-changed", handler);
    return () =>
      ipcRenderer.removeListener(
        "settings:audio-playback-mode-changed",
        handler,
      );
  },
  sendCleanupContextChanged: (): void =>
    ipcRenderer.send("settings:cleanup-context-changed"),
  onCleanupContextChanged: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("settings:cleanup-context-changed", handler);
    return () =>
      ipcRenderer.removeListener("settings:cleanup-context-changed", handler);
  },
  sendAudioLevel: (level: number): void =>
    ipcRenderer.send("audio:level", level),
  onAudioLevel: (callback: (level: number) => void): (() => void) => {
    const handler = (_: unknown, level: number): void => callback(level);
    ipcRenderer.on("audio:level", handler);
    return () => ipcRenderer.removeListener("audio:level", handler);
  },
  sendRecordingCommitted: (): void => ipcRenderer.send("recording:committed"),
  sendRecordingCancelled: (): void => ipcRenderer.send("recording:cancelled"),
  onFullscreenChanged: (
    callback: (fullscreen: boolean) => void,
  ): (() => void) => {
    const handler = (_: unknown, fullscreen: boolean): void =>
      callback(fullscreen);
    ipcRenderer.on("fullscreen:changed", handler);
    return () => ipcRenderer.removeListener("fullscreen:changed", handler);
  },
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
  showPluginView: (...args: unknown[]): Promise<boolean> =>
    ipcRenderer.invoke("plugin-view:show", ...args),
  setPluginViewBounds: (bounds: unknown): void =>
    ipcRenderer.send("plugin-view:set-bounds", bounds),
  hidePluginView: (): void => ipcRenderer.send("plugin-view:hide"),
  invalidatePluginView: (): void => ipcRenderer.send("plugin-view:invalidate"),
  onPluginNavigate: (callback: (to: string) => void): (() => void) => {
    const handler = (_: unknown, to: string): void => callback(to);
    ipcRenderer.on("plugin:navigate", handler);
    return () => ipcRenderer.removeListener("plugin:navigate", handler);
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
  // Whether to show the desktop workspace on a signed-in app launch. This is
  // deliberately an Electron-local preference, not a Cloud setting.
  getShowDashboardOnLaunch: (): Promise<boolean> =>
    ipcRenderer.invoke("settings:show-dashboard-on-launch"),
  setShowDashboardOnLaunch: (enabled: boolean): void =>
    ipcRenderer.send("settings:set-show-dashboard-on-launch", enabled),
  // Session display names are intentionally Electron-local during the Remix
  // experiment: they improve the sidebar without changing Cloud thread data.
  getRemixSessionTitles: (): Promise<Record<string, string>> =>
    ipcRenderer.invoke("settings:remix-session-titles"),
  setRemixSessionTitle: (
    threadId: string,
    title: string | null,
  ): Promise<boolean> =>
    ipcRenderer.invoke("settings:set-remix-session-title", threadId, title),
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
