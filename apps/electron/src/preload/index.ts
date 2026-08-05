import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";
import type {
  ActiveAudioPlaybackMode,
  AudioPlaybackMode,
} from "../shared/audio-playback";
import { getDefaultHotkey } from "../shared/hotkey-defaults";
import type { OpenAppCandidate } from "../shared/open-apps";
import {
  normalizePillCancelMode,
  type PillCancelMode,
} from "../shared/pill-cancel";
import type { PluginViewBounds } from "../shared/plugins";
import {
  getDefaultRemixHotkey,
  type RemixContextResult,
  type RemixCopyResult,
  type RemixPrimitiveResult,
  type RemixReadDocumentResult,
  type RemixRecapturePayload,
  type RemixSelectionPayload,
  type RemixSelectResult,
} from "../shared/remix";

// Custom APIs for renderer
const api = {
  // The renderer can't reach process.platform reliably (navigator.platform
  // is deprecated); expose it once here so all platform checks agree.
  platform: process.platform as string,
  isE2E: process.env.FREESTYLE_E2E === "1",
  defaultHotkey: getDefaultHotkey(),
  defaultRemixHotkey: getDefaultRemixHotkey(),
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
  // Ask the pill window to grow around the capsule (or shrink back) so the
  // expanded status card has somewhere to render.
  setPillExpanded: (
    expanded: boolean,
    expansion?: "card" | "remix-chat",
  ): void => ipcRenderer.send("pill:set-expanded", expanded, expansion),
  // The held remix room shows only a small surface — keep the window
  // click-through outside this rect (null restores full interactivity).
  setPillHotRect: (
    rect: { x: number; y: number; width: number; height: number } | null,
  ): void => ipcRenderer.send("pill:set-hot-rect", rect),
  onPillHotEnter: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("pill:hot-enter", handler);
    return () => ipcRenderer.removeListener("pill:hot-enter", handler);
  },
  showErrorDialog: (title: string, message: string): Promise<void> =>
    ipcRenderer.invoke("dialog:show-error", title, message),
  getServerPort: (): Promise<number> => ipcRenderer.invoke("server:port"),
  // Configured external server URL/token ("" = built-in local server / no auth).
  getServerUrl: (): Promise<string> => ipcRenderer.invoke("server:url"),
  setServerUrl: (url: string): Promise<string> =>
    ipcRenderer.invoke("server:set-url", url),
  getServerToken: (): Promise<string> => ipcRenderer.invoke("server:token"),
  setServerToken: (token: string): Promise<string> =>
    ipcRenderer.invoke("server:set-token", token),
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
  cloudPromptSignIn: (): Promise<boolean> =>
    ipcRenderer.invoke("cloud:prompt-sign-in"),
  cloudPromptUpgrade: (): Promise<boolean> =>
    ipcRenderer.invoke("cloud:prompt-upgrade"),
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
  // --- Remix ---
  reloadRemixHotkey: (): void => ipcRenderer.send("remix-hotkey:reload"),
  /** Replace the user's selection with the remix's result. */
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
  /** The captured selection plus the anchor it was captured in. */
  onRemixSelection: (
    callback: (payload: RemixSelectionPayload) => void,
  ): (() => void) => {
    const handler = (_: unknown, payload: RemixSelectionPayload): void =>
      callback(
        payload ?? {
          text: null,
          appName: null,
          windowTitle: null,
          capturedAt: Date.now(),
        },
      );
    ipcRenderer.on("remix:selection", handler);
    return () => ipcRenderer.removeListener("remix:selection", handler);
  },
  /** Re-read the selection + frontmost app (fast-lane preset refresh). */
  remixRecapture: (): Promise<RemixRecapturePayload> =>
    ipcRenderer.invoke("remix:recapture"),
  // --- Remix primitives (the agent's tools; workflow lives in its prompt) ---
  remixGetContext: (): Promise<RemixContextResult> =>
    ipcRenderer.invoke("remix:get-context"),
  remixReadDocument: (): Promise<RemixReadDocumentResult> =>
    ipcRenderer.invoke("remix:read-document"),
  remixSelectAll: (): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:select-all"),
  remixSelectText: (
    text: string,
    occurrence?: number,
  ): Promise<RemixSelectResult> =>
    ipcRenderer.invoke("remix:select-text", text, occurrence),
  remixCollapseSelection: (): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:collapse-selection"),
  remixCopy: (): Promise<RemixCopyResult> => ipcRenderer.invoke("remix:copy"),
  remixSetClipboard: (text: string): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:set-clipboard", text),
  remixSetClipboardImage: (url: string): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:set-clipboard-image", url),
  remixPasteClipboard: (): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:paste-clipboard"),
  remixUndo: (): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:undo"),
  remixRedo: (): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:redo"),
  remixPressKey: (key: string, times?: number): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:press-key", key, times),
  remixGetClipboard: (): Promise<RemixCopyResult> =>
    ipcRenderer.invoke("remix:get-clipboard"),
  /** Fast-lane replace for the preset chips; clipboard preserved. */
  remixPasteText: (text: string): Promise<RemixPrimitiveResult> =>
    ipcRenderer.invoke("remix:paste-text", text),
  /** The chat card's input needs the keyboard; focusability follows it. */
  setRemixChatFocus: (focus: boolean): void =>
    ipcRenderer.send("remix:set-chat-focus", focus),
  /**
   * Release (or re-claim) the digit route shortcuts. The chat card holds no
   * routes, so keeping Control+1..3 claimed for its whole lifetime would take
   * them from the rest of the system.
   */
  setRemixRouteKeys: (open: boolean): void =>
    ipcRenderer.send("remix:set-route-keys", open),
  /** The persistent bar was hovered; main opens the chat. */
  remixBarHover: (): void => ipcRenderer.send("remix:bar-hover"),
  /** Onboarding practice: allow Remix to target our own window while true. */
  setRemixPracticeTarget: (active: boolean): void =>
    ipcRenderer.send("remix:set-practice-target", active),
  /** Remix delivered text into the practice draft (paste succeeded). */
  onRemixPracticeDelivered: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("remix:practice-delivered", handler);
    return () =>
      ipcRenderer.removeListener("remix:practice-delivered", handler);
  },
  /** Main wants the chat card open (bar hover) — no instruction attached. */
  onRemixOpenChat: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("remix:open-chat", handler);
    return () => ipcRenderer.removeListener("remix:open-chat", handler);
  },
  /** A route shortcut (chord + digit) fired; zero-based index. */
  onRemixRoute: (callback: (index: number) => void): (() => void) => {
    const handler = (_: unknown, index: number): void => callback(index);
    ipcRenderer.on("remix:route", handler);
    return () => ipcRenderer.removeListener("remix:route", handler);
  },
  /**
   * A dictation started on the shared home key and the remix chord is
   * taking over. Drop the recording but leave the pill window alone — the
   * remix card is about to use it.
   */
  onRemixSupersede: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("remix:supersede", handler);
    return () => ipcRenderer.removeListener("remix:supersede", handler);
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
    uinputAccess: boolean;
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
  getOpenAppCandidates: (): Promise<OpenAppCandidate[]> =>
    ipcRenderer.invoke("system:open-app-candidates"),
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
  // Pill cancel button
  sendPillCancelModeChanged: (mode: PillCancelMode): void =>
    ipcRenderer.send("settings:pill-cancel-mode-changed", mode),
  onPillCancelModeChanged: (
    callback: (mode: PillCancelMode) => void,
  ): (() => void) => {
    const handler = (_: unknown, mode: unknown): void =>
      callback(normalizePillCancelMode(mode));
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
  // Cleanup context — the dashboard notifies the pill when a cleanup-relevant
  // setting (llm_cleanup or a cleanup tone) changes so the pill can refresh its
  // cached "needs frontmost app for routing" decision instead of re-fetching
  // /api/settings on every single recording start.
  sendCleanupContextChanged: (): void =>
    ipcRenderer.send("settings:cleanup-context-changed"),
  onCleanupContextChanged: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("settings:cleanup-context-changed", handler);
    return () =>
      ipcRenderer.removeListener("settings:cleanup-context-changed", handler);
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
  // Discovery, install, catalog, and updates now go directly renderer→server
  // over the typed `hc` client (see renderer/src/lib/plugins-api.ts). Only the
  // native view overlay and the cache-invalidation signal stay on IPC.
  showPluginView: (
    slug: string,
    pageId: string,
    entry: string,
    bounds: PluginViewBounds,
    tokens?: Record<string, string>,
  ): Promise<boolean> =>
    ipcRenderer.invoke("plugin-view:show", slug, pageId, entry, bounds, tokens),
  setPluginViewBounds: (bounds: PluginViewBounds): void =>
    ipcRenderer.send("plugin-view:set-bounds", bounds),
  hidePluginView: (): void => ipcRenderer.send("plugin-view:hide"),
  invalidatePluginView: (): void => ipcRenderer.send("plugin-view:invalidate"),
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
