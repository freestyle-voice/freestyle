import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import type { PostProcessParams } from "@freestyle-voice/stt";

type CleanupProviderOptions = NonNullable<PostProcessParams["providerOptions"]>;

export const MINIMAX_PROVIDERS = [
  {
    providerId: "minimax",
    providerName: "MiniMax",
    baseURL: "https://api.minimax.io/anthropic",
  },
  {
    providerId: "minimax-cn",
    providerName: "MiniMax (China)",
    baseURL: "https://api.minimaxi.com/anthropic",
  },
] as const;

export type MiniMaxProviderId =
  (typeof MINIMAX_PROVIDERS)[number]["providerId"];

export const MINIMAX_MODELS = [
  {
    modelId: "MiniMax-M3",
    contextWindow: 1_000_000,
    pricing: {
      input: 0.6,
      output: 2.4,
      cacheRead: 0.12,
      cacheWrite: null,
    },
    inputModalities: ["text", "image", "video"],
    thinking: ["adaptive", "disabled"],
  },
  {
    modelId: "MiniMax-M2.7",
    contextWindow: 204_800,
    pricing: {
      input: 0.3,
      output: 1.2,
      cacheRead: 0.06,
      cacheWrite: 0.375,
    },
    inputModalities: ["text"],
    thinking: ["always_on"],
  },
] as const;

function stripMiniMaxPrefix(modelId: string): string {
  return modelId.replace(/^minimax(?:-cn)?\//, "");
}

export function isMiniMaxProviderId(
  providerId: string,
): providerId is MiniMaxProviderId {
  return MINIMAX_PROVIDERS.some(
    (provider) => provider.providerId === providerId,
  );
}

export function getMiniMaxModelMetadata(
  providerId: string,
  modelId: string,
): (typeof MINIMAX_MODELS)[number] | undefined {
  if (!isMiniMaxProviderId(providerId)) return undefined;
  const shortId = stripMiniMaxPrefix(modelId);
  return MINIMAX_MODELS.find((model) => model.modelId === shortId);
}

export function minimaxCleanupProviderOptions(
  modelId: string,
): CleanupProviderOptions | undefined {
  const model = getMiniMaxModelMetadata("minimax", modelId);
  if (!model?.thinking.some((mode) => mode === "disabled")) return undefined;

  const anthropic: AnthropicLanguageModelOptions = {
    thinking: { type: "disabled" },
  };
  return { anthropic };
}
