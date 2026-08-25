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
        micState: "idle",
        remixBusy: false,
      }),
    ).toMatchObject({ action: "listen", label: "Start listening" });
  });

  it("keeps the text field stable while live listening feedback is rendered separately", () => {
    expect(
      remixComposerVoiceState({
        draft: "Write this down",
        micState: "recording",
        remixBusy: false,
      }),
    ).toMatchObject({
      action: "finish-listening",
      label: "Stop listening",
      value: "Write this down",
      placeholder: "Message Remix",
    });
  });

  it("acknowledges microphone startup without accepting another tap", () => {
    expect(
      remixComposerVoiceState({
        draft: "",
        micState: "starting" as never,
        remixBusy: false,
      }),
    ).toMatchObject({
      action: "waiting-for-microphone",
      label: "Starting microphone",
    });
  });

  it("appends a final voice transcript to the existing draft", () => {
    expect(appendVoiceTranscript("Draft a reply", "with a warm tone")).toBe(
      "Draft a reply with a warm tone",
    );
  });
});
