/**
 * Single source of truth for the remix hotkey default, mirroring
 * `hotkey-defaults.ts` for dictation.
 *
 * - macOS: Fn (Globe) + Control. Two modifiers and no letter, which is what
 *   keeps it clear of the Globe shortcuts macOS already owns — Globe+C is
 *   Control Center, Globe+E is emoji, Globe+F is fullscreen, and so on down
 *   the alphabet. It also shares its home key with dictation's solo Fn, so the
 *   two live under the same finger.
 * - Windows/Linux: Control+Alt+E, matching the dictation default's modifiers.
 *   A real key rather than a bare chord, because the native listeners on those
 *   platforms suppress a named key, not a modifier combination.
 *
 * Imported by the main process and the preload script (which exposes it to the
 * renderer as `window.api.defaultRemixHotkey`).
 */
export function getDefaultRemixHotkey(
  platform: string = process.platform,
): string {
  switch (platform) {
    case "darwin":
      return "Fn+Control";
    default:
      return "Control+Alt+E";
  }
}

/**
 * How long the key must be down to count as a hold, and so as speech. Below
 * this the press is a tap: the card opens on its own, showing the routes and
 * their digits, and nothing is recorded. The threshold matches the one
 * dictation uses to throw away an accidental tap, so the two hotkeys feel the
 * same under the finger.
 */
export const REMIX_HOLD_THRESHOLD_MS = 250;

/**
 * How long a tapped-open card waits, untouched, before dismissing itself.
 *
 * Not merely tidiness: the route digits are held as global shortcuts for as
 * long as the card is up, so this is the bound on how long they can be taken
 * from the rest of the system. A card left open behind a full-screen window
 * would otherwise keep them indefinitely.
 */
export const REMIX_IDLE_MS = 12_000;

/**
 * How long the chat card keeps an idle thread on screen. Much longer than the
 * preset card's idle window — a conversation is something the user comes back
 * to — and matched by the server's thread-decay window, so the card and the
 * stored thread age out together.
 */
export const REMIX_CHAT_IDLE_MS = 15 * 60 * 1000;

/** What one hotkey press captured: the selection plus its anchor. */
export interface RemixSelectionPayload {
  text: string | null;
  appName: string | null;
  windowTitle: string | null;
  /** Active browser tab URL when the anchor is a browser (Docs routing). */
  url?: string | null;
  /** Preview of the user's clipboard text (capped), and its full length —
   * "edit this" with nothing highlighted usually means the clipboard. */
  clipboard?: string | null;
  clipboardLength?: number;
  capturedAt: number;
}

/** A re-capture for a typed follow-up. `stale` means the pill had focus. */
export interface RemixRecapturePayload {
  selection: string | null;
  appName: string | null;
  windowTitle: string | null;
  url?: string | null;
  clipboard?: string | null;
  clipboardLength?: number;
  capturedAt: number;
  stale: boolean;
}

/** Result of one primitive action against the user's machine. */
export interface RemixPrimitiveResult {
  ok: boolean;
  /** Short machine-readable failure, e.g. "document-not-in-front". */
  reason?: string;
}

/** get_context: the machine as it is right now. */
export interface RemixContextResult extends RemixPrimitiveResult {
  appName: string | null;
  windowTitle: string | null;
  url: string | null;
  selection: string | null;
  /** Whether select_text can place the selection precisely in this app. */
  preciseSelection?: boolean;
  /** The focused document's character count, when the app exposes it. */
  docLength?: number | null;
  /** Preview of the user's clipboard text (capped) and its full length. */
  clipboardPreview?: string | null;
  clipboardLength?: number;
}

/** read_document: the whole document via accessibility, highlight intact. */
export interface RemixReadDocumentResult extends RemixPrimitiveResult {
  text?: string;
  truncated?: boolean;
  /** The current selection's range within the text (UTF-16 offsets). */
  selStart?: number;
  selLen?: number;
}

/** copy: the selection's text, capped for the model. */
export interface RemixCopyResult extends RemixPrimitiveResult {
  text?: string;
  truncated?: boolean;
}

/** select_text: whether precise selection landed. */
export interface RemixSelectResult extends RemixPrimitiveResult {
  reason?:
    | "unsupported"
    | "not-found"
    | "ambiguous"
    | "failed"
    | "document-not-in-front";
  /** How many occurrences exist, on ambiguous / out-of-range results. */
  matches?: number;
}

/** How much clipboard text travels as ambient context; get_clipboard has it all. */
export const REMIX_CLIPBOARD_PREVIEW_LIMIT = 300;
