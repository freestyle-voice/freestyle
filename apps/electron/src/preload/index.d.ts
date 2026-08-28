import { ElectronAPI } from "@electron-toolkit/preload";
import type { ActiveAudioPlaybackMode } from "../shared/audio-playback";
import type { CompanionForm, CompanionState } from "../shared/companion";
import type { DictationPrefs } from "../shared/dictation-prefs";
import type { PetState } from "../shared/pet";
import type {
  RemixContextResult,
  RemixCopyResult,
  RemixPrimitiveResult,
  RemixReadDocumentResult,
} from "../shared/remix";
import type { SpriteEvent } from "../shared/sprite-events";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      /**
       * Transitional legacy renderer bridge. Explicit modern methods below
       * remain typed; the historic desktop modules use additional IPC members
       * while they are ported onto those current contracts.
       */
      [legacyMethod: string]: any;
      platform: string;
      pasteText: (text: string, appContext?: string | null) => Promise<void>;
      copyText: (text: string, appContext?: string | null) => Promise<void>;
      requestAgentFileSaveGrant: (input: {
        toolCallId: string;
        filename: string;
        content: string;
      }) => Promise<{ ok: boolean; grant?: string; reason?: string }>;
      saveAgentFile: (input: {
        toolCallId: string;
        filename: string;
        content: string;
        grant: string;
      }) => Promise<{ ok: boolean; path?: string; reason?: string }>;
      prepareSystemAudio: (mode: ActiveAudioPlaybackMode) => Promise<void>;
      restoreSystemAudio: () => Promise<void>;
      getServerPort: () => Promise<number>;
      getServerUrl: () => Promise<string>;
      getServerToken: () => Promise<string>;
      onServerChanged: (callback: () => void) => () => void;
      openLogsFolder: () => Promise<boolean>;
      openExternal: (url: string) => Promise<boolean>;
      onTalkDown: (cb: () => void) => () => void;
      onTalkUp: (cb: () => void) => () => void;
      onHotkeyDown: (callback: () => void) => () => void;
      onHotkeyUp: (callback: () => void) => () => void;
      onDictationCancel: (callback: () => void) => () => void;
      onFullscreenChanged: (
        callback: (fullscreen: boolean) => void,
      ) => () => void;
      setDictationPhase: (phase: "idle" | "recording" | "transcribing") => void;
      onHotkeyError: (callback: (message: string) => void) => () => void;
      setHotkeyMode: (mode: "hold" | "toggle") => void;
      reloadRemixHotkey: () => void;
      remixGetContext: () => Promise<RemixContextResult>;
      remixReadDocument: () => Promise<RemixReadDocumentResult>;
      remixSetClipboard: (text: string) => Promise<RemixPrimitiveResult>;
      remixPasteClipboard: () => Promise<RemixPrimitiveResult>;
      remixGetClipboard: () => Promise<RemixCopyResult>;
      companionForm: () => Promise<CompanionForm>;
      petEnabled: () => Promise<boolean>;
      setPetEnabled: (enabled: boolean) => void;
      setPetState: (state: PetState) => void;
      companionSetHotRect: (
        rect: { x: number; y: number; width: number; height: number } | null,
      ) => void;
      setCompanionForm: (form: CompanionForm) => void;
      panelOpenForDictation: () => void;
      panelDictationPartial: (text: string) => void;
      panelDictationFinal: (text: string) => void;
      panelDictationError: (message: string) => void;
      panelRendererReady: () => void;
      onPanelDictation: (
        callback: (ev: {
          kind: "partial" | "final" | "error";
          text: string;
        }) => void,
      ) => () => void;
      dictationPrefs: () => Promise<DictationPrefs>;
      onDictationPrefs: (
        callback: (prefs: DictationPrefs) => void,
      ) => () => void;
      reloadDictationPrefs: () => void;
      panelClose: () => void;
      panelResizeWidth: (width: number) => void;
      panelCommitWidth: () => void;
      openSettings: () => void;
      settingsClose: () => void;
      panelSetBusy: (busy: boolean) => void;
      panelRequestFocus: () => void;
      panelPointerLeft: () => void;
      panelPointerEntered: () => void;
      onPanelFocusComposer: (callback: () => void) => () => void;
      notificationPresent: (payload: {
        messageId: string;
        title: string;
        body: string;
      }) => void;
      notificationSetVisible: (visible: boolean) => void;
      notificationSetHeight: (height: number) => void;
      notificationOpenThread: (threadId: string) => void;
      notificationAuthChanged: () => void;
      onNotificationAuthChanged: (callback: () => void) => () => void;
      onNotificationNativeClick: (
        callback: (messageId: string) => void,
      ) => () => void;
      onPanelOpenThread: (callback: (threadId: string) => void) => () => void;
      onCompanionForm: (callback: (form: CompanionForm) => void) => () => void;
      onCompanionState: (
        callback: (state: CompanionState) => void,
      ) => () => void;
      onCompanionHotEnter: (callback: () => void) => () => void;
      spriteEvent: (ev: SpriteEvent) => void;
      spritePerformSync: (payload: {
        name: string;
        toolClass: string;
      }) => Promise<boolean>;
      spriteImpact: (nonce: string) => void;
      spritePerformDone: (nonce: string) => void;
      onSpriteEvent: (callback: (ev: SpriteEvent) => void) => () => void;
      checkMicPermission: () => Promise<string>;
      requestMicPermission: () => Promise<string>;
      checkAccessibilityPermission: () => Promise<boolean>;
      openAccessibilitySettings: () => void;
      openMicSettings: () => void;
      startHotkeyRecording: () => void;
      stopHotkeyRecording: (hotkey?: string) => void;
      onHotkeyRecordModifiers: (
        callback: (modifiers: string[]) => void,
      ) => () => void;
      onHotkeyRecordCaptured: (
        callback: (combo: { modifiers: string[]; key: string }) => void,
      ) => () => void;
      onHotkeyRecordReleased: (callback: () => void) => () => void;
      onHotkeyRecordCancel: (callback: () => void) => () => void;
      getAppVersion: () => Promise<string>;
      // Auto-updater
      checkForUpdate: () => Promise<{
        version: string;
        downloadState: string;
      } | null>;
      downloadUpdate: () => void;
      installUpdate: () => void;
      getUpdateStatus: () => Promise<{
        version: string | null;
        downloadState: "idle" | "downloading" | "downloaded";
      }>;
      onUpdateStatus: (
        callback: (status: {
          version: string | null;
          downloadState: "idle" | "downloading" | "downloaded";
        }) => void,
      ) => () => void;
      // Auto-update setting
      getAutoUpdate: () => Promise<boolean>;
      setAutoUpdate: (enabled: boolean) => void;
      // Launch at startup setting
      getLaunchAtStartup: () => Promise<boolean>;
      setLaunchAtStartup: (enabled: boolean) => void;
      // Electron-local workspace launch preference
      getShowDashboardOnLaunch: () => Promise<boolean>;
      setShowDashboardOnLaunch: (enabled: boolean) => void;
      // Electron-local Remix session display names; never sent to Cloud.
      getRemixSessionTitles: () => Promise<Record<string, string>>;
      setRemixSessionTitle: (
        threadId: string,
        title: string | null,
      ) => Promise<boolean>;
      // Context-aware dictation
      getFrontmostApp: () => Promise<string | null>;
      // Transcription completion broadcast
      sendTranscriptionDone: () => void;
      onTranscriptionDone: (callback: () => void) => () => void;
    };
  }
}
