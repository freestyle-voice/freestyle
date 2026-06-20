import { electronAPI } from "@electron-toolkit/preload";
import type {
  AgentAuthMode,
  AgentCliStatus,
  AgentConversation,
  AgentEvent,
  AgentMessage,
  AgentPrereqStatus,
  AgentRunSummary,
  AgentStartResult,
  ComputerUseMode,
  ComputerUsePrereqs,
  GuidanceEvent,
} from "@freestyle/validations";
import { contextBridge, ipcRenderer } from "electron";
import type {
  ActiveAudioPlaybackMode,
  AudioPlaybackMode,
} from "../shared/audio-playback";
import { getDefaultHotkey } from "../shared/hotkey-defaults";

// Custom APIs for renderer
const api = {
  // The renderer can't reach process.platform reliably (navigator.platform
  // is deprecated); expose it once here so all platform checks agree.
  platform: process.platform as string,
  isE2E: process.env.FREESTYLE_E2E === "1",
  defaultHotkey: getDefaultHotkey(),
  pasteText: (text: string): Promise<void> =>
    ipcRenderer.invoke("paste:text", text),
  copyText: (text: string): Promise<void> =>
    ipcRenderer.invoke("copy:text", text),
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
  // Server URL ("" = use the bundled local server)
  getServerUrl: (): Promise<string> => ipcRenderer.invoke("server:url"),
  setServerUrl: (url: string): Promise<string> =>
    ipcRenderer.invoke("server:set-url", url),
  // Optional bearer token for a configured server ("" = none)
  getServerToken: (): Promise<string> => ipcRenderer.invoke("server:token"),
  setServerToken: (token: string): Promise<string> =>
    ipcRenderer.invoke("server:set-token", token),
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
  stopHotkeyRecording: (hotkey?: string, target?: string): void =>
    ipcRenderer.send("hotkey-record:stop", hotkey, target),
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
  // --- Claude Code agent (Voice OS) ---
  agent: {
    prereqStatus: (): Promise<AgentPrereqStatus> =>
      ipcRenderer.invoke("agent:prereq-status"),
    setAuthMode: (mode: AgentAuthMode): void =>
      ipcRenderer.send("agent:set-auth-mode", mode),
    cliStatus: (): Promise<AgentCliStatus> =>
      ipcRenderer.invoke("agent:cli-status"),
    loginStart: (): Promise<{ ok: boolean; code: number | null }> =>
      ipcRenderer.invoke("agent:login-start"),
    onLoginOutput: (callback: (chunk: string) => void): (() => void) => {
      const handler = (_: unknown, chunk: string): void => callback(chunk);
      ipcRenderer.on("agent:login-output", handler);
      return () => ipcRenderer.removeListener("agent:login-output", handler);
    },
    openTerminalLogin: (): void =>
      ipcRenderer.send("agent:open-terminal-login"),
    updateAgentHotkey: (accel: string): void =>
      ipcRenderer.send("agent-hotkey:update", accel),
    setBarAttention: (on: boolean): void =>
      ipcRenderer.send("agent-bar:attention", on),
    onBarAttention: (callback: (on: boolean) => void): (() => void) => {
      const handler = (_: unknown, on: boolean): void => callback(on);
      ipcRenderer.on("agent-bar:attention", handler);
      return () => ipcRenderer.removeListener("agent-bar:attention", handler);
    },
    onAgentHotkeyRecorded: (
      callback: (result: {
        ok: boolean;
        accel: string;
        reason?: string;
      }) => void,
    ): (() => void) => {
      const handler = (
        _: unknown,
        result: { ok: boolean; accel: string; reason?: string },
      ): void => callback(result);
      ipcRenderer.on("agent-hotkey:recorded", handler);
      return () => ipcRenderer.removeListener("agent-hotkey:recorded", handler);
    },
    start: (payload: {
      prompt: string;
      runId: string;
      cwd?: string;
      resume?: string;
    }): Promise<AgentStartResult> => ipcRenderer.invoke("agent:start", payload),
    cancel: (runId: string): void => ipcRenderer.send("agent:cancel", runId),
    listRunning: (): Promise<AgentRunSummary[]> =>
      ipcRenderer.invoke("agent:list-running"),
    listConversations: (cwd?: string): Promise<AgentConversation[]> =>
      ipcRenderer.invoke("agent:list-conversations", cwd),
    getConversation: (id: string, cwd?: string): Promise<AgentMessage[]> =>
      ipcRenderer.invoke("agent:get-conversation", id, cwd),
    getProjects: (): Promise<{ current: string; recent: string[] }> =>
      ipcRenderer.invoke("agent:get-projects"),
    pickProject: (): Promise<string | null> =>
      ipcRenderer.invoke("agent:pick-project"),
    setProject: (cwd: string): void =>
      ipcRenderer.send("agent:set-project", cwd),
    setComposing: (composing: boolean): void =>
      ipcRenderer.send("agent-bar:composing", composing),
    reveal: (): void => ipcRenderer.send("agent-bar:reveal"),
    setHoverRect: (
      rect: { x: number; y: number; width: number; height: number } | null,
    ): void => ipcRenderer.send("agent-bar:hover-rect", rect),
    getComputerUse: (): Promise<boolean> =>
      ipcRenderer.invoke("agent:computer-use:get"),
    setComputerUse: (enabled: boolean): void =>
      ipcRenderer.send("agent:computer-use:set", enabled),
    getComputerUseMode: (): Promise<ComputerUseMode> =>
      ipcRenderer.invoke("agent:computer-use:mode:get"),
    setComputerUseMode: (mode: ComputerUseMode): void =>
      ipcRenderer.send("agent:computer-use:mode:set", mode),
    computerUseStatus: (): Promise<ComputerUsePrereqs> =>
      ipcRenderer.invoke("agent:computer-use:status"),
    installComputerUse: (): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke("agent:computer-use:install"),
    requestScreenRecording: (): Promise<ComputerUsePrereqs> =>
      ipcRenderer.invoke("agent:computer-use:request-screen-recording"),
    onHotkeyDown: (callback: () => void): (() => void) => {
      const handler = (): void => callback();
      ipcRenderer.on("agent-hotkey:down", handler);
      return () => ipcRenderer.removeListener("agent-hotkey:down", handler);
    },
    onHotkeyUp: (callback: () => void): (() => void) => {
      const handler = (): void => callback();
      ipcRenderer.on("agent-hotkey:up", handler);
      return () => ipcRenderer.removeListener("agent-hotkey:up", handler);
    },
    onEvent: (callback: (event: AgentEvent) => void): (() => void) => {
      const handler = (_: unknown, event: AgentEvent): void => callback(event);
      ipcRenderer.on("agent:event", handler);
      return () => ipcRenderer.removeListener("agent:event", handler);
    },
    onSetExpanded: (callback: (expanded: boolean) => void): (() => void) => {
      const handler = (_: unknown, expanded: boolean): void =>
        callback(expanded);
      ipcRenderer.on("agent-bar:set-expanded", handler);
      return () =>
        ipcRenderer.removeListener("agent-bar:set-expanded", handler);
    },
  },
  // Guided-mode ghost-cursor overlay (consumed only by the overlay window).
  overlay: {
    onGuidance: (callback: (event: GuidanceEvent) => void): (() => void) => {
      const handler = (_: unknown, event: GuidanceEvent): void =>
        callback(event);
      ipcRenderer.on("overlay:guidance", handler);
      return () => ipcRenderer.removeListener("overlay:guidance", handler);
    },
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
