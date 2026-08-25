type ComposerMicState = "idle" | "recording" | "finalizing";

type RemixComposerVoiceInput = {
  draft: string;
  micState: ComposerMicState;
  remixBusy: boolean;
};

export function appendVoiceTranscript(draft: string, transcript: string) {
  return [draft.trim(), transcript.trim()].filter(Boolean).join(" ");
}

export function remixComposerVoiceState({
  draft,
  micState,
  remixBusy,
}: RemixComposerVoiceInput) {
  if (remixBusy) {
    return {
      action: "stop-remix" as const,
      label: "Stop Remix",
      placeholder: "Message Remix",
      value: draft,
    };
  }

  if (micState === "recording") {
    return {
      action: "finish-listening" as const,
      label: "Stop listening",
      // Keep the native field stable while the live transcript is shown in the
      // composer's status row. Replacing the placeholder with it hides the
      // draft and makes the control look like a second, unrelated surface.
      placeholder: "Message Remix",
      value: draft,
    };
  }

  if (micState === "finalizing") {
    return {
      action: "waiting-for-transcript" as const,
      label: "Transcribing voice input",
      placeholder: "Transcribing…",
      value: draft,
    };
  }

  if (draft.trim()) {
    return {
      action: "send" as const,
      label: "Send to Remix",
      placeholder: "Message Remix",
      value: draft,
    };
  }

  return {
    action: "listen" as const,
    label: "Start listening",
    placeholder: "Message Remix",
    value: "",
  };
}
