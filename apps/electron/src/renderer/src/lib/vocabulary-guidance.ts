type TranscriptionModel = {
  provider: string;
  model_id: string;
  model_name: string;
};

type VocabularyGuidance = { supported: boolean; detail: string };

export function vocabularyGuidance(
  model: TranscriptionModel | undefined,
): VocabularyGuidance {
  if (!model) {
    return {
      supported: false,
      detail:
        "Choose a transcription model in Models to see how it uses vocabulary.",
    };
  }
  const id = model.model_id.toLowerCase();
  if (model.provider === "deepgram" && id.includes("nova-2")) {
    return {
      supported: true,
      detail: `${model.model_name} uses single words. Multi-word terms are split into individual words.`,
    };
  }
  if (
    ["freestyle-cloud", "openai", "groq", "soniox"].includes(model.provider) ||
    (model.provider === "deepgram" && id.includes("nova-3"))
  ) {
    return {
      supported: true,
      detail: `${model.model_name} uses words and phrases as recognition hints. Exact spelling is not guaranteed.`,
    };
  }
  if (model.provider === "elevenlabs" && id.includes("scribe_v2")) {
    return {
      supported: true,
      detail: `${model.model_name} uses vocabulary hints. Streaming uses up to 50 terms, limited to 20 characters each; longer terms are shortened.`,
    };
  }
  return {
    supported: false,
    detail: `${model.model_name} does not use vocabulary hints. Your terms stay saved for a compatible model.`,
  };
}
