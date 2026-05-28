import { getDefaultModel, getSetting } from "./db";
import { getApiKey } from "./storage";

export interface TranscriptionResult {
  raw: string;
  durationMs: number;
  provider: string;
  model: string;
}

function stripProviderPrefix(modelId: string): string {
  const slashIdx = modelId.indexOf("/");
  return slashIdx >= 0 ? modelId.slice(slashIdx + 1) : modelId;
}

export async function transcribeAudio(
  audioUri: string,
): Promise<TranscriptionResult> {
  const startTime = Date.now();

  const voiceModel = await getDefaultModel("voice");
  if (!voiceModel) {
    throw new Error(
      "No voice model configured. Go to Settings > Models to set one up.",
    );
  }

  const apiKey = await getApiKey(voiceModel.provider);
  if (!apiKey) {
    throw new Error(
      `No API key configured for ${voiceModel.provider}. Go to Settings > API Keys.`,
    );
  }

  const languageSetting = await getSetting("language");
  const language =
    languageSetting && languageSetting !== "auto" ? languageSetting : undefined;

  const modelId = stripProviderPrefix(voiceModel.model_id);

  let raw: string;

  switch (voiceModel.provider) {
    case "openai":
      raw = await transcribeOpenAI(audioUri, apiKey, modelId, language);
      break;
    case "groq":
      raw = await transcribeGroq(audioUri, apiKey, modelId, language);
      break;
    case "deepgram":
      raw = await transcribeDeepgram(audioUri, apiKey, modelId, language);
      break;
    case "elevenlabs":
      raw = await transcribeElevenLabs(audioUri, apiKey, modelId, language);
      break;
    default:
      throw new Error(
        `Unsupported transcription provider: ${voiceModel.provider}`,
      );
  }

  return {
    raw,
    durationMs: Date.now() - startTime,
    provider: voiceModel.provider,
    model: voiceModel.model_id,
  };
}

function getAudioMimeType(uri: string): { type: string; name: string } {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".wav"))
    return { type: "audio/wav", name: "recording.wav" };
  if (lower.endsWith(".mp4") || lower.endsWith(".m4a"))
    return { type: "audio/m4a", name: "recording.m4a" };
  if (lower.endsWith(".webm"))
    return { type: "audio/webm", name: "recording.webm" };
  if (lower.endsWith(".ogg"))
    return { type: "audio/ogg", name: "recording.ogg" };
  if (lower.endsWith(".3gp"))
    return { type: "audio/3gpp", name: "recording.3gp" };
  return { type: "audio/m4a", name: "recording.m4a" };
}

function createFileFormData(
  fieldName: string,
  audioUri: string,
  additionalFields?: Record<string, string>,
): FormData {
  const formData = new FormData();
  const { type, name } = getAudioMimeType(audioUri);

  // React Native FormData requires { uri, type, name } objects for file uploads
  formData.append(fieldName, {
    uri: audioUri,
    type,
    name,
  } as any);

  if (additionalFields) {
    for (const [key, value] of Object.entries(additionalFields)) {
      formData.append(key, value);
    }
  }

  return formData;
}

async function transcribeOpenAI(
  audioUri: string,
  apiKey: string,
  model: string,
  language?: string,
): Promise<string> {
  const fields: Record<string, string> = { model };
  if (language) fields.language = language;

  const formData = createFileFormData("file", audioUri, fields);

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `OpenAI transcription failed: ${response.status} ${errText}`,
    );
  }

  const result = await response.json();
  return result.text ?? "";
}

async function transcribeGroq(
  audioUri: string,
  apiKey: string,
  model: string,
  language?: string,
): Promise<string> {
  const fields: Record<string, string> = { model };
  if (language) fields.language = language;

  const formData = createFileFormData("file", audioUri, fields);

  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq transcription failed: ${response.status} ${errText}`);
  }

  const result = await response.json();
  return result.text ?? "";
}

async function transcribeDeepgram(
  audioUri: string,
  apiKey: string,
  model: string,
  language?: string,
): Promise<string> {
  const params = new URLSearchParams({ model });
  if (language) params.set("language", language);

  const { type } = getAudioMimeType(audioUri);
  const fileResponse = await fetch(audioUri);
  const audioBlob = await fileResponse.blob();

  const response = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": type,
      },
      body: audioBlob,
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Deepgram transcription failed: ${response.status} ${errText}`,
    );
  }

  const result = await response.json();
  return result.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
}

async function transcribeElevenLabs(
  audioUri: string,
  apiKey: string,
  model: string,
  _language?: string,
): Promise<string> {
  const formData = createFileFormData("file", audioUri, { model_id: model });

  const response = await fetch(
    "https://api.elevenlabs.io/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData,
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `ElevenLabs transcription failed: ${response.status} ${errText}`,
    );
  }

  const result = await response.json();
  return result.text ?? "";
}
