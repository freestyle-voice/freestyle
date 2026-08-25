type ComposerMicState = "idle" | "recording" | "finalizing";

type RemixComposerVoiceInput = {
  draft: string;
  partial: string;
  micState: ComposerMicState;
  remixBusy: boolean;
};

export function appendVoiceTranscript(draft: string, transcript: string) {
  return [draft.trim(), transcript.trim()].filter(Boolean).join(" ");
}

export function remixComposerVoiceState({
  draft,
  partial,
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
      // Keep the real input value stable so focus stays on the same native
      // field while the microphone streams.
      placeholder: partial || "Listening…",
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
