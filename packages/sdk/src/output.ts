/**
 * How final dictation text is delivered to the user's focused application.
 *
 * A const object (not a TS `enum`) so it has both a runtime value and a derived
 * type, stays tree-shakeable, and matches the convention used elsewhere in the
 * workspace. Plugins may assign either the constant (`OutputMode.None`) or the
 * literal (`"none"`).
 */
export const OutputMode = {
  /** Write to the clipboard and synthesize Cmd/Ctrl+V into the focused app. */
  Paste: "paste",
  /** Write to the clipboard only; the user pastes manually. */
  Clipboard: "clipboard",
  /**
   * Suppress delivery entirely — nothing is pasted or copied. Hints the app
   * that it has nothing to do (e.g. a voice-command plugin consumed the
   * utterance instead of typing it).
   */
  None: "none",
} as const;

export type OutputMode = (typeof OutputMode)[keyof typeof OutputMode];
