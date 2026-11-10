import type { PlatformApi } from "../../../preload/index";
import { getDefaultHotkey } from "../../../shared/hotkey-defaults";

export const browserCapabilities = {
  globalHotkeys: false,
  nativeWindows: false,
  accessibility: false,
  systemAudio: false,
  autoUpdate: false,
} as const;

export interface BrowserHost {
  storage: Pick<Storage, "getItem" | "setItem">;
  openExternal: (url: string) => boolean;
  navigate: (route: string) => void;
  unsupported: (action: string) => void;
  writeClipboard: (text: string) => Promise<void>;
  readClipboard: () => Promise<string>;
  micPermission: () => Promise<string>;
  requestMic: () => Promise<string>;
}

/** Explicit implementations: no Proxy or catch-all that hides missing methods. */
export function createBrowserApi(
  host: BrowserHost,
  options: { platform: string; version: string; apiBase: string },
): PlatformApi {
  const listeners = new Map<string, Set<() => void>>();
  const subscribe = (event: string, callback: () => void) => {
    const callbacks = listeners.get(event) ?? new Set();
    listeners.set(event, callbacks);
    callbacks.add(callback);
    return () => {
      callbacks.delete(callback);
    };
  };
  const emit = (event: string) => {
    for (const callback of listeners.get(event) ?? []) callback();
  };
  const noop = () => {};
  // Native events cannot occur in a browser. Return a real cleanup function.
  const nativeSubscription = () => noop;
  const native = (action: string) => () => host.unsupported(action);
  const rejected = async () => {
    host.unsupported("This action");
    throw new Error("This action requires the desktop application.");
  };
  const unavailable = async () => {
    host.unsupported("This action");
    return false;
  };
  return {
    platform: options.platform,
    isE2E: false,
    defaultHotkey: getDefaultHotkey(options.platform),
    updateHotkey: native("Global shortcuts"),
    reloadHotkey: noop,
    hidePill: noop,
    setPillExpanded: noop,
    setPillHotRect: noop,
    onPillHotEnter: nativeSubscription,
    onPillCancel: nativeSubscription,
    showErrorDialog: async (title, message) =>
      host.unsupported(`${title}: ${message}`),
    // Vite owns the proxy target/token. Never store or expose its token in JS.
    getServerUrl: async () => options.apiBase,
    getServerToken: async () => "",
    getServerPort: async () => 4649,
    setServerUrl: async () => {
      host.unsupported(
        "Changing the server target (restart Vite with FREESTYLE_BROWSER_SERVER_URL)",
      );
      return "";
    },
    setServerToken: async () => {
      host.unsupported(
        "Changing server credentials (configure the Vite process)",
      );
      return "";
    },
    onServerChanged: nativeSubscription,
    cloudPromptSignIn: async () => {
      host.navigate("/profile");
      return true;
    },
    cloudPromptUpgrade: async () => {
      host.navigate("/settings/billing");
      return true;
    },
    localWhisperPromptRecovery: async () => {
      host.navigate("/settings/models");
      return "models";
    },
    pasteText: rejected,
    copyText: (text) => host.writeClipboard(text),
    prepareSystemAudio: rejected,
    restoreSystemAudio: async () => {},
    openLogsFolder: unavailable,
    openExternal: async (url) => {
      try {
        if (!["http:", "https:", "mailto:"].includes(new URL(url).protocol))
          return false;
        return host.openExternal(url);
      } catch {
        return false;
      }
    },
    onHotkeyDown: nativeSubscription,
    onHotkeyUp: nativeSubscription,
    onDictationCancel: nativeSubscription,
    setDictationPhase: noop,
    onHotkeyError: nativeSubscription,
    setHotkeyMode: noop,
    panelRendererReady: noop,
    dictationPrefs: async () => ({
      destination: "composer",
      outputMode: "clipboard",
      soundEnabled: false,
      audioPlaybackMode: "off",
      micDeviceId: null,
    }),
    onDictationPrefs: nativeSubscription,
    reloadDictationPrefs: noop,
    panelClose: () => host.navigate("/today"),
    panelResizeWidth: noop,
    panelCommitWidth: noop,
    setPanelSidebarHidden: noop,
    openSettings: () => host.navigate("/settings"),
    settingsClose: () => host.navigate("/today"),
    onDashboardNavigate: nativeSubscription,
    getOpenAppCandidates: async () => [],
    getPillPosition: async () => "bottom-center",
    setPillPosition: native("Voice pill positioning"),
    onPillPositionChanged: nativeSubscription,
    sendOutputModeChanged: noop,
    onOutputModeChanged: nativeSubscription,
    sendPillCancelModeChanged: noop,
    onPillCancelModeChanged: nativeSubscription,
    sendAudioDuckingChanged: noop,
    onAudioDuckingChanged: nativeSubscription,
    sendAudioPlaybackModeChanged: noop,
    onAudioPlaybackModeChanged: nativeSubscription,
    sendCleanupContextChanged: noop,
    onCleanupContextChanged: nativeSubscription,
    sendAudioLevel: noop,
    onAudioLevel: nativeSubscription,
    sendRecordingCommitted: noop,
    sendRecordingCancelled: noop,
    onFullscreenChanged: nativeSubscription,
    onMicActivityChanged: nativeSubscription,
    showPluginView: unavailable,
    setPluginViewBounds: noop,
    hidePluginView: noop,
    invalidatePluginView: noop,
    onPluginNavigate: nativeSubscription,
    checkMicPermission: host.micPermission,
    requestMicPermission: host.requestMic,
    checkAccessibilityPermission: async () => false,
    openAccessibilitySettings: native("Accessibility settings"),
    openMicSettings: native("System microphone settings"),
    startHotkeyRecording: native("Global shortcut recording"),
    stopHotkeyRecording: noop,
    onHotkeyRecordModifiers: nativeSubscription,
    onHotkeyRecordCaptured: nativeSubscription,
    onHotkeyRecordReleased: nativeSubscription,
    onHotkeyRecordCancel: nativeSubscription,
    getAppVersion: async () => `${options.version} (browser)`,
    checkForUpdate: async () => null,
    downloadUpdate: native("App updates"),
    installUpdate: native("App updates"),
    getUpdateStatus: async () => ({ version: null, downloadState: "idle" }),
    onUpdateStatus: nativeSubscription,
    getAutoUpdate: async () => false,
    setAutoUpdate: native("App updates"),
    getLaunchAtStartup: async () => false,
    setLaunchAtStartup: native("Launch at startup"),
    getShowDashboardOnLaunch: async () => false,
    setShowDashboardOnLaunch: native("Desktop launch preferences"),
    getFrontmostApp: async () => null,
    sendTranscriptionDone: () => emit("transcription"),
    onTranscriptionDone: (callback) => subscribe("transcription", callback),
  };
}
