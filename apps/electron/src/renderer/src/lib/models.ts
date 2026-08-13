export interface AvailableModel {
  provider_id: string;
  provider_name: string;
  model_id: string;
  model_name: string;
  family?: string;
  type: "voice" | "llm";
}

export const FREESTYLE_CLOUD_PROVIDER_ID = "freestyle-cloud";
export const FREESTYLE_CLOUD_MODEL_ID = "freestyle-cloud/stt";

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  "freestyle-cloud": "Freestyle Transcribe",
};

export function displayProviderName(
  providerId: string,
  fallback?: string,
): string {
  return PROVIDER_DISPLAY_NAMES[providerId] ?? fallback ?? providerId;
}
