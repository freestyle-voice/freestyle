import { ElectronAPI } from "@electron-toolkit/preload";
import type {
  ActiveAudioPlaybackMode,
  AudioPlaybackMode,
} from "../shared/audio-playback";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      platform: string;
      isE2E: boolean;
      defaultHotkey: string;
      pasteText: (text: string) => Promise<void>;
      copyText: (text: string) => Promise<void>;
      prepareSystemAudio: (mode: ActiveAudioPlaybackMode) => Promise<void>;
      duckSystemAudio: () => Promise<void>;
      restoreSystemAudio: () => Promise<void>;
      updateHotkey: (hotkey: string) => void;
      reloadHotkey: () => void;
      setHotkeyMode: (mode: "hold" | "toggle") => void;
      hidePill: () => void;
      showErrorDialog: (title: string, message: string) => Promise<void>;
      getServerPort: () => Promise<number>;
      getServerUrl: () => Promise<string>;
      setServerUrl: (url: string) => Promise<string>;
      getServerToken: () => Promise<string>;
      setServerToken: (token: string) => Promise<string>;
      onHotkeyDown: (callback: () => void) => () => void;
      onHotkeyUp: (callback: () => void) => () => void;
      onPillCancel: (callback: () => void) => () => void;
      checkMicPermission: () => Promise<string>;
      requestMicPermission: () => Promise<string>;
      checkAccessibilityPermission: () => Promise<boolean>;
      checkLinuxSetup: () => Promise<{
        wayland: boolean;
        inputAccess: boolean;
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
      // Pill position
      getPillPosition: () => Promise<string>;
      setPillPosition: (position: string) => void;
      onPillPositionChanged: (
        callback: (position: string) => void,
      ) => () => void;
      // Output mode
      sendOutputModeChanged: (mode: string) => void;
      onOutputModeChanged: (callback: (mode: string) => void) => () => void;
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
      onTranscriptionDone: (callback: () => void) => () => void;
      // Fullscreen state
      onFullscreenChanged: (
        callback: (isFullscreen: boolean) => void,
      ) => () => void;
      // Microphone activity detection
      onMicActivityChanged: (
        callback: (state: "active" | "inactive" | "unknown") => void,
      ) => () => void;
    };
  }
}
