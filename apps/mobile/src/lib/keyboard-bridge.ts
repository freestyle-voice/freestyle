/**
 * Backwards-compatible re-export of the keyboard dictation bridge.
 *
 * The bridge moved to `@/lib/keyboard/dictation-bridge` when the keyboard gained
 * a full bidirectional (resident-session) protocol. This shim keeps existing
 * imports (`clearKeyboardSession`, `setPendingTranscript`) working.
 */
export {
  clearKeyboardSession,
  setPendingTranscript,
} from "@/lib/keyboard/dictation-bridge";
