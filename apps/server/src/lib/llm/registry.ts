import type { LanguageModel } from "ai";
import { freestyleCloudUrl } from "../freestyle-cloud.js";

export async function createFreestyleCloudChatModel(
  modelId: string,
  sessionToken: string,
): Promise<LanguageModel> {
  const { createOpenAI } = await import("@ai-sdk/openai");
  return createOpenAI({
    apiKey: sessionToken,
    baseURL: `${freestyleCloudUrl()}/v2/llm`,
  }).chat(modelId);
}
