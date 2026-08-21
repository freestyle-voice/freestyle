/**
 * Where dictated text lands inside the panel. The companion owns the recorder;
 * the panel only receives partial/final text over IPC and decides which field
 * it belongs to.
 */

import type { PanelTab } from "@shared/panel";

export type DictationSinkId = "chat" | "todo" | "note";

export type DictationMode = "append" | "replace";

/** Which field the hotkey dictates into. Tabs without one fall back to chat. */
export function sinkForTab(tab: PanelTab): DictationSinkId {
  if (tab === "todos") return "todo";
  if (tab === "notes") return "note";
  return "chat";
}

export interface DictationSinkEvent {
  kind: "partial" | "final" | "error";
  text: string;
}

/**
 * Handed to a tab so its text field can receive the dictation stream. Returns
 * an unregister for cleanup.
 */
export type RegisterDictationSink = (
  handler: (ev: DictationSinkEvent) => void,
) => () => void;

/**
 * Text captured before the current utterance started. `null` means no utterance
 * is in flight, so the next partial snapshots whatever is already there.
 */
export type DictationBase = string | null;

export interface DictationSinkState {
  base: DictationBase;
  text: string;
}

function join(base: string, text: string): string {
  return base ? `${base} ${text}` : text;
}

/**
 * Partials stream repeatedly and each one is the WHOLE utterance so far, not a
 * delta. Snapshot the pre-existing text once, then render base + live text so
 * each partial replaces its predecessor rather than stacking on it.
 */
export function applyPartial(
  prev: string,
  base: DictationBase,
  text: string,
): DictationSinkState {
  const anchor = base === null ? prev.trim() : base;
  return { base: anchor, text: join(anchor, text) };
}

/**
 * The final REPLACES the partial tail — appending here would duplicate the
 * utterance, since the partials already wrote it. Falls back to the current
 * text when no partial ever arrived (short utterances can skip straight to a
 * final).
 */
export function applyFinal(
  prev: string,
  base: DictationBase,
  text: string,
): DictationSinkState {
  const anchor = base ?? prev.trim();
  return { base: null, text: join(anchor, text) };
}

/**
 * An errored utterance rewinds to the snapshot so a failed attempt doesn't
 * strand a half-transcribed partial in the field.
 */
export function applyError(
  prev: string,
  base: DictationBase,
): DictationSinkState {
  return { base: null, text: base === null ? prev : base };
}

/**
 * Advances a field's utterance state by one event. Replace mode drops the
 * field's contents when an utterance opens; an error opens nothing, it rewinds
 * whatever was in flight.
 */
export function nextUtterance(
  state: DictationSinkState,
  ev: DictationSinkEvent,
  mode: DictationMode = "append",
): DictationSinkState {
  const base =
    state.base === null && mode === "replace" && ev.kind !== "error"
      ? ""
      : state.base;
  if (ev.kind === "partial") return applyPartial(state.text, base, ev.text);
  if (ev.kind === "final") return applyFinal(state.text, base, ev.text);
  return applyError(state.text, base);
}
