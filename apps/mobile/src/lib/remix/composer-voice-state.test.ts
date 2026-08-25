import { describe, expect, it } from "vitest";

import {
  appendVoiceTranscript,
  remixComposerVoiceState,
} from "./composer-voice-state";

describe("Remix composer voice state", () => {
  it("starts inline listening from an empty draft instead of changing modes", () => {
    expect(
      remixComposerVoiceState({
        draft: "",
        partial: "",
        micState: "idle",
        remixBusy: false,
      }),
    ).toMatchObject({ action: "listen", label: "Start listening" });
  });

  it("shows the live phrase and lets the user stop recording", () => {
    expect(
      remixComposerVoiceState({
        draft: "Write this down",
        partial: "and send it tomorrow",
        micState: "recording",
        remixBusy: false,
      }),
    ).toMatchObject({
      action: "finish-listening",
      label: "Stop listening",
      value: "and send it tomorrow",
    });
  });

  it("appends a final voice transcript to the existing draft", () => {
    expect(appendVoiceTranscript("Draft a reply", "with a warm tone")).toBe(
      "Draft a reply with a warm tone",
    );
  });
});
