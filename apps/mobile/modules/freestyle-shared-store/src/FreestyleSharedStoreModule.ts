import { NativeModule, requireNativeModule } from "expo";

/** A command the keyboard sends to the app, forwarded from the App Group. */
export interface KeyboardCommand {
  kind:
    | "start"
    | "beginCapture"
    | "commit"
    | "cancelCapture"
    | "ackInsert"
    | "disarm";
  token: string;
  ackInsertionToken: string;
  updatedAt: number;
}

/** Session snapshot the app publishes for the keyboard (heartbeat is stamped
 * natively). */
export interface DictationStateInput {
  phase:
    | "idle"
    | "arming"
    | "armed"
    | "capturing"
    | "transcribing"
    | "ready"
    | "failed";
  sessionID: string;
  partialTranscript: string;
  finalTranscript: string;
  insertionToken: string;
  statusMessage: string;
  /** Live mic input level in [0, 1] for the keyboard's meter. */
  level: number;
}

/** Events emitted to JS — `onCommand` fires when the keyboard posts a command. */
type FreestyleSharedStoreModuleEvents = {
  onCommand(command: KeyboardCommand): void;
};

declare class FreestyleSharedStoreModule extends NativeModule<FreestyleSharedStoreModuleEvents> {
  /** Publish a full session snapshot for the keyboard (stamps the heartbeat). */
  writeState(state: DictationStateInput): void;
  /** Refresh only the mic level + heartbeat (called per audio frame). */
  updateLevel(level: number): void;
  /** Refresh only the heartbeat (cheap keep-alive between full writes). */
  touchHeartbeat(): void;
  /** Clear the state channel back to idle. */
  resetState(): void;
  /** Read the keyboard's latest command, or null when the channel is empty. */
  loadCommand(): KeyboardCommand | null;
  /** Clear the command channel after handling a command. */
  clearCommand(): void;

  /** Legacy one-shot hand-off: publish a ready transcript with no session. */
  setPendingTranscript(text: string): void;
  /** Remove every shared key (used on sign-out). */
  clear(): void;
}

// Loads the native module object from the JSI.
export default requireNativeModule<FreestyleSharedStoreModule>(
  "FreestyleSharedStore",
);
