import { describe, expect, it } from "vitest";

import {
  applyError,
  applyFinal,
  applyPartial,
  type DictationMode,
  type DictationSinkEvent,
  type DictationSinkState,
  nextUtterance,
  sinkForTab,
} from "./dictation-sink";

/** Replays a session the way the IPC stream delivers it. */
function dictate(
  start: string,
  events: DictationSinkEvent[],
  mode: DictationMode = "append",
): DictationSinkState {
  return events.reduce<DictationSinkState>(
    (state, ev) => nextUtterance(state, ev, mode),
    { base: null, text: start },
  );
}

const say = (text: string): DictationSinkEvent[] => [
  { kind: "partial", text: text.slice(0, Math.ceil(text.length / 2)) },
  { kind: "partial", text },
  { kind: "final", text },
];

describe("dictation sink reducer", () => {
  it("snapshots existing text once so partials replace rather than stack", () => {
    const first = applyPartial("shopping", null, "buy");
    expect(first).toEqual({ base: "shopping", text: "shopping buy" });

    // The second partial carries the whole utterance again, not a delta.
    const second = applyPartial(first.text, first.base, "buy milk");
    expect(second).toEqual({ base: "shopping", text: "shopping buy milk" });
  });

  it("starts from empty when the field was blank", () => {
    const partial = applyPartial("", null, "call the bank");
    expect(partial).toEqual({ base: "", text: "call the bank" });
  });

  it("replaces the partial tail on final instead of appending it", () => {
    const partial = applyPartial("", null, "pick up dry");
    const final = applyFinal(
      partial.text,
      partial.base,
      "pick up dry cleaning",
    );
    expect(final).toEqual({ base: null, text: "pick up dry cleaning" });
  });

  it("appends to typed text when a final arrives with no prior partial", () => {
    const final = applyFinal("remember to", null, "water the plants");
    expect(final).toEqual({ base: null, text: "remember to water the plants" });
  });

  it("trims the snapshot so a trailing space doesn't double up", () => {
    const partial = applyPartial("groceries  ", null, "eggs");
    expect(partial.text).toBe("groceries eggs");
  });

  it("rewinds to the snapshot on error", () => {
    const partial = applyPartial("draft note", null, "half transcribed");
    const errored = applyError(partial.text, partial.base);
    expect(errored).toEqual({ base: null, text: "draft note" });
  });

  it("leaves the field untouched when an error arrives with no utterance", () => {
    expect(applyError("typed by hand", null)).toEqual({
      base: null,
      text: "typed by hand",
    });
  });

  it("starts a replace-mode utterance from empty, dropping the stale field text", () => {
    // Regression: a to-do box that appended left the first thing ever dictated
    // glued to the front of every later utterance.
    const stale = "buy milk";
    const partial = applyPartial(stale, "", "call the bank");
    expect(partial).toEqual({ base: "", text: "call the bank" });

    const final = applyFinal(partial.text, partial.base, "call the bank today");
    expect(final).toEqual({ base: null, text: "call the bank today" });
  });

  it("rewinds rather than clears when a replace-mode utterance errors", () => {
    // The "" base belongs to partial/final only; applying it to an error would
    // wipe text the user typed by hand.
    expect(applyError("call the bank", null)).toEqual({
      base: null,
      text: "call the bank",
    });
  });

  it("clears the base after a final so the next utterance re-snapshots", () => {
    const final = applyFinal("", null, "first thought");
    const next = applyPartial(final.text, final.base, "second");
    expect(next).toEqual({
      base: "first thought",
      text: "first thought second",
    });
  });
});

describe("nextUtterance sessions", () => {
  it("writes one utterance without duplicating the partial tail", () => {
    expect(dictate("", say("buy milk")).text).toBe("buy milk");
  });

  it("appends successive utterances in append mode", () => {
    const first = dictate("", say("buy milk"));
    const second = say("call the bank").reduce(
      (state, ev) => nextUtterance(state, ev),
      first,
    );
    expect(second.text).toBe("buy milk call the bank");
  });

  it("keeps only the newest utterance in replace mode", () => {
    // Regression: a to-do box that appended pinned the first thing ever
    // dictated to the front of every later utterance.
    const first = dictate("", say("buy milk"), "replace");
    const second = say("call the bank").reduce(
      (state, ev) => nextUtterance(state, ev, "replace"),
      first,
    );
    expect(second.text).toBe("call the bank");
  });

  it("builds on text typed before the utterance in append mode", () => {
    expect(dictate("remember to", say("water the plants")).text).toBe(
      "remember to water the plants",
    );
  });

  it("discards text typed before the utterance in replace mode", () => {
    expect(
      dictate("stale draft", say("water the plants"), "replace").text,
    ).toBe("water the plants");
  });

  it("rewinds to the pre-utterance text when a session errors", () => {
    const state = dictate("remember to", [
      { kind: "partial", text: "water the" },
      { kind: "error", text: "Transcription failed" },
    ]);
    expect(state).toEqual({ base: null, text: "remember to" });
  });

  it("leaves hand-typed text alone when an error opens no utterance", () => {
    // Regression: replace mode substituted an empty base on errors too, which
    // wiped a to-do the user had typed.
    const state = dictate(
      "call the bank",
      [{ kind: "error", text: "Microphone access is off" }],
      "replace",
    );
    expect(state).toEqual({ base: null, text: "call the bank" });
  });

  it("recovers after an error so the next utterance still lands", () => {
    const errored = dictate("", [
      { kind: "partial", text: "half" },
      { kind: "error", text: "failed" },
    ]);
    const retried = say("buy milk").reduce(
      (state, ev) => nextUtterance(state, ev),
      errored,
    );
    expect(retried.text).toBe("buy milk");
  });

  it("handles a final with no preceding partial", () => {
    expect(dictate("", [{ kind: "final", text: "buy milk" }]).text).toBe(
      "buy milk",
    );
  });

  it("closes the utterance on final so a reset cannot strand a base", () => {
    expect(dictate("", say("buy milk")).base).toBeNull();
  });
});

describe("sinkForTab", () => {
  it("routes tabs that own a text field to their own sink", () => {
    expect(sinkForTab("todos")).toBe("todo");
    expect(sinkForTab("notes")).toBe("note");
  });

  it("falls back to chat for tabs without one", () => {
    for (const tab of ["chat", "history", "brain", "apps"] as const)
      expect(sinkForTab(tab)).toBe("chat");
  });
});
