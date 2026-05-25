import { ElectronAPI } from "@electron-toolkit/preload";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      pasteText: (text: string) => Promise<void>;
      updateHotkey: (hotkey: string) => void;
      hidePill: () => void;
      getServerPort: () => Promise<number>;
      onHotkeyDown: (callback: () => void) => () => void;
      onHotkeyUp: (callback: () => void) => () => void;
      checkMicPermission: () => Promise<string>;
      requestMicPermission: () => Promise<string>;
      checkAccessibilityPermission: () => Promise<boolean>;
      openAccessibilitySettings: () => void;
      openMicSettings: () => void;
      getOnboardingComplete: () => Promise<boolean>;
      setOnboardingComplete: () => void;
      startHotkeyRecording: () => void;
      stopHotkeyRecording: () => void;
      onHotkeyRecordModifiers: (
        callback: (modifiers: string[]) => void,
      ) => () => void;
      onHotkeyRecordCaptured: (
        callback: (combo: { modifiers: string[]; key: string }) => void,
      ) => () => void;
      onHotkeyRecordCancel: (callback: () => void) => () => void;
      // Auto-updater
      checkForUpdate: () => Promise<string | null>;
      downloadUpdate: () => void;
      installUpdate: () => void;
      onUpdateAvailable: (
        callback: (info: { version: string }) => void,
      ) => () => void;
      onUpdateDownloaded: (
        callback: (info: { version: string }) => void,
      ) => () => void;
      // Auto-update setting
      getAutoUpdate: () => Promise<boolean>;
      setAutoUpdate: (enabled: boolean) => void;
      // Context-aware dictation
      getFrontmostApp: () => Promise<string | null>;
      // Pill position
      getPillPosition: () => Promise<string>;
      setPillPosition: (position: string) => void;
      // Hotkey error notifications
      onHotkeyError: (
        callback: (error: { message: string }) => void,
      ) => () => void;
      onFullscreenChanged: (
        callback: (isFullscreen: boolean) => void,
      ) => () => void;
    };
  }
}
