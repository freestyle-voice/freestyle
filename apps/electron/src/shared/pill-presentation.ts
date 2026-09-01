/**
 * Expanded surfaces the built-in pill can show. This is intentionally a
 * closed union: Dictate and Remix share one Electron window, and no plugin or
 * renderer can claim an arbitrary size or a competing owner for that window.
 */
export type PillExpansion = "card" | "remix-chat";

export type PillPresentationKind = "collapsed" | PillExpansion;

export interface PillPresentation {
  kind: PillPresentationKind;
  expansion: PillExpansion | null;
}

export interface PillPresentationInput {
  /** A dictation failure needs the compact recovery card. */
  dictationError: boolean;
  /** Any live Remix session owns the full chat room, including follow-ups. */
  remixActive: boolean;
}

/**
 * Pick the one built-in surface that owns the pill window.
 *
 * Remix wins deliberately: it persists through microphone capture,
 * transcription, streaming, and the settled response. Letting an unrelated
 * dictation error select the compact card during that lifetime shrinks the
 * window around the live chat and is the source of empty or clipped follow-up
 * pills.
 */
export function resolvePillPresentation(
  input: PillPresentationInput,
): PillPresentation {
  if (input.remixActive) return { kind: "remix-chat", expansion: "remix-chat" };
  if (input.dictationError) return { kind: "card", expansion: "card" };
  return { kind: "collapsed", expansion: null };
}

/** Keep the IPC boundary closed to the two host-owned expanded surfaces. */
export function normalizePillExpansion(value: unknown): PillExpansion {
  return value === "remix-chat" ? "remix-chat" : "card";
}
