import { ElectronAPI } from "@electron-toolkit/preload";
import type { ActiveAudioPlaybackMode } from "../shared/audio-playback";
import type { CompanionForm, CompanionState } from "../shared/companion";
import type { DictationPrefs } from "../shared/dictation-prefs";
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
      platform: string;
      pasteText: (text: string, appContext?: string | null) => Promise<void>;
      copyText: (text: string, appContext?: string | null) => Promise<void>;
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
      companionSetHotRect: (
        rect: { x: number; y: number; width: number; height: number } | null,
      ) => void;
      companionHover: () => void;
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
      panelSetBusy: (busy: boolean) => void;
      panelRequestFocus: () => void;
      panelPointerLeft: () => void;
      panelPointerEntered: () => void;
      onPanelFocusComposer: (callback: () => void) => () => void;
      notificationsList: () => Promise<unknown[]>;
      notificationDismiss: (id: string) => void;
      notificationOpen: (id: string) => void;
      notificationSetHeight: (height: number) => void;
      notificationSetHovered: (hovering: boolean) => void;
      onNotificationsChanged: (callback: () => void) => () => void;
      agentTurnFinished: (payload: {
        threadId: string;
        excerpt: string;
      }) => void;
      onPanelOpenThread: (callback: (threadId: string) => void) => () => void;
      onPanelShowSettings: (callback: () => void) => () => void;
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
      // Context-aware dictation
      getFrontmostApp: () => Promise<string | null>;
      // Transcription completion broadcast
      sendTranscriptionDone: () => void;
      onTranscriptionDone: (callback: () => void) => () => void;
    };
  }
}
