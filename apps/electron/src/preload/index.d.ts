import { ElectronAPI } from "@electron-toolkit/preload";
import type {
  ActiveAudioPlaybackMode,
  AudioPlaybackMode,
} from "../shared/audio-playback";
import type { OpenAppCandidate } from "../shared/open-apps";
import type { PillCancelMode } from "../shared/pill-cancel";
import type { PluginViewBounds } from "../shared/plugins";
import type {
  RemixContextResult,
  RemixCopyResult,
  RemixPrimitiveResult,
  RemixReadDocumentResult,
  RemixRecapturePayload,
  RemixSelectionPayload,
  RemixSelectResult,
} from "../shared/remix";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      platform: string;
      isE2E: boolean;
      defaultHotkey: string;
      defaultRemixHotkey: string;
      pasteText: (text: string, appContext?: string | null) => Promise<void>;
      copyText: (text: string, appContext?: string | null) => Promise<void>;
      prepareSystemAudio: (mode: ActiveAudioPlaybackMode) => Promise<void>;
      duckSystemAudio: () => Promise<void>;
      restoreSystemAudio: () => Promise<void>;
      updateHotkey: (hotkey: string) => void;
      reloadHotkey: () => void;
      setHotkeyMode: (mode: "hold" | "toggle") => void;
      hidePill: () => void;
      setPillExpanded: (
        expanded: boolean,
        expansion?: "card" | "remix-chat",
      ) => void;
      setPillHotRect: (
        rect: { x: number; y: number; width: number; height: number } | null,
      ) => void;
      onPillHotEnter: (callback: () => void) => () => void;
      showErrorDialog: (title: string, message: string) => Promise<void>;
      getServerPort: () => Promise<number>;
      getServerUrl: () => Promise<string>;
      setServerUrl: (url: string) => Promise<string>;
      getServerToken: () => Promise<string>;
      setServerToken: (token: string) => Promise<string>;
      onServerChanged: (callback: () => void) => () => void;
      openLogsFolder: () => Promise<boolean>;
      openExternal: (url: string) => Promise<boolean>;
      cloudPromptSignIn: () => Promise<boolean>;
      cloudPromptUpgrade: () => Promise<boolean>;
      onHotkeyDown: (callback: () => void) => () => void;
      onHotkeyUp: (callback: () => void) => () => void;
      onPillCancel: (callback: () => void) => () => void;
      reloadRemixHotkey: () => void;
      pasteRemixResult: (text: string) => Promise<boolean>;
      onRemixDown: (callback: () => void) => () => void;
      onRemixUp: (callback: () => void) => () => void;
      onRemixSelection: (
        callback: (payload: RemixSelectionPayload) => void,
      ) => () => void;
      onRemixRoute: (callback: (index: number) => void) => () => void;
      onRemixSupersede: (callback: () => void) => () => void;
      remixRecapture: () => Promise<RemixRecapturePayload>;
      remixGetContext: () => Promise<RemixContextResult>;
      remixReadDocument: () => Promise<RemixReadDocumentResult>;
      remixSelectAll: () => Promise<RemixPrimitiveResult>;
      remixSelectText: (
        text: string,
        occurrence?: number,
      ) => Promise<RemixSelectResult>;
      remixCollapseSelection: () => Promise<RemixPrimitiveResult>;
      remixCopy: () => Promise<RemixCopyResult>;
      remixSetClipboard: (text: string) => Promise<RemixPrimitiveResult>;
      remixSetClipboardImage: (url: string) => Promise<RemixPrimitiveResult>;
      remixPasteClipboard: () => Promise<RemixPrimitiveResult>;
      remixUndo: () => Promise<RemixPrimitiveResult>;
      remixRedo: () => Promise<RemixPrimitiveResult>;
      remixPressKey: (
        key: string,
        times?: number,
      ) => Promise<RemixPrimitiveResult>;
      remixGetClipboard: () => Promise<RemixCopyResult>;
      remixPasteText: (text: string) => Promise<RemixPrimitiveResult>;
      setRemixChatFocus: (focus: boolean) => void;
      setRemixRouteKeys: (open: boolean) => void;
      remixBarHover: () => void;
      setRemixPracticeTarget: (active: boolean) => void;
      onRemixPracticeDelivered: (callback: () => void) => () => void;
      onRemixOpenChat: (callback: () => void) => () => void;
      checkMicPermission: () => Promise<string>;
      requestMicPermission: () => Promise<string>;
      checkAccessibilityPermission: () => Promise<boolean>;
      checkLinuxSetup: () => Promise<{
        wayland: boolean;
        inputAccess: boolean;
        uinputAccess: boolean;
        pasteToolRequired: string;
        pasteTool: string | null;
      } | null>;
      openAccessibilitySettings: () => void;
      openMicSettings: () => void;
      getOnboardingComplete: () => Promise<boolean>;
      setOnboardingComplete: () => void;
      startHotkeyRecording: () => void;
      pauseHotkeyRecording: () => void;
      stopHotkeyRecording: (hotkey?: string) => void;
      onHotkeyRecordModifiers: (
        callback: (modifiers: string[]) => void,
      ) => () => void;
      onHotkeyRecordCaptured: (
        callback: (combo: { modifiers: string[]; key: string }) => void,
      ) => () => void;
      onHotkeyRecordReleased: (callback: () => void) => () => void;
      onHotkeyRecordCancel: (callback: () => void) => () => void;
      // Auto-updater
      checkForUpdate: () => Promise<{
        version: string;
        downloadState: string;
      } | null>;
      downloadUpdate: () => void;
      installUpdate: () => void;
      onUpdateAvailable: (
        callback: (info: { version: string }) => void,
      ) => () => void;
      onUpdateDownloaded: (
        callback: (info: { version: string }) => void,
      ) => () => void;
      onUpdateDownloading: (callback: () => void) => () => void;
      onUpdateError: (
        callback: (info: { message: string }) => void,
      ) => () => void;
      // Auto-update setting
      getAutoUpdate: () => Promise<boolean>;
      setAutoUpdate: (enabled: boolean) => void;
      // Launch at startup setting
      getLaunchAtStartup: () => Promise<boolean>;
      setLaunchAtStartup: (enabled: boolean) => void;
      // Show dashboard on launch setting
      getShowDashboardOnLaunch: () => Promise<boolean>;
      setShowDashboardOnLaunch: (enabled: boolean) => void;
      // Context-aware dictation
      getFrontmostApp: () => Promise<string | null>;
      getOpenAppCandidates: () => Promise<OpenAppCandidate[]>;
      // Pill position
      getPillPosition: () => Promise<string>;
      setPillPosition: (position: string) => void;
      onPillPositionChanged: (
        callback: (position: string) => void,
      ) => () => void;
      // Output mode
      sendOutputModeChanged: (mode: string) => void;
      onOutputModeChanged: (callback: (mode: string) => void) => () => void;
      // Pill cancel button
      sendPillCancelModeChanged: (mode: PillCancelMode) => void;
      onPillCancelModeChanged: (
        callback: (mode: PillCancelMode) => void,
      ) => () => void;
      sendAudioDuckingChanged: (enabled: boolean) => void;
      onAudioDuckingChanged: (
        callback: (enabled: boolean) => void,
      ) => () => void;
      sendAudioPlaybackModeChanged: (mode: AudioPlaybackMode) => void;
      onAudioPlaybackModeChanged: (
        callback: (mode: AudioPlaybackMode) => void,
      ) => () => void;
      // Hotkey error notifications
      onHotkeyError: (
        callback: (error: { message: string }) => void,
      ) => () => void;
      // Audio level stream
      sendAudioLevel: (level: number) => void;
      onAudioLevel: (callback: (level: number) => void) => () => void;
      // Transcription completion broadcast
      sendTranscriptionDone: () => void;
      sendRecordingCommitted: () => void;
      sendRecordingCancelled: () => void;
      onTranscriptionDone: (callback: () => void) => () => void;
      // Fullscreen state
      onFullscreenChanged: (
        callback: (isFullscreen: boolean) => void,
      ) => () => void;
      // Microphone activity detection
      onMicActivityChanged: (
        callback: (state: "active" | "inactive" | "unknown") => void,
      ) => () => void;
      // Plugins — discovery/install/catalog/updates go renderer→server over
      // the typed client; only the native view overlay stays on IPC.
      showPluginView: (
        slug: string,
        pageId: string,
        entry: string,
        bounds: PluginViewBounds,
        tokens?: Record<string, string>,
      ) => Promise<boolean>;
      setPluginViewBounds: (bounds: PluginViewBounds) => void;
      hidePluginView: () => void;
      invalidatePluginView: () => void;
      onPluginNavigate: (callback: (to: string) => void) => () => void;
    };
  }
}
