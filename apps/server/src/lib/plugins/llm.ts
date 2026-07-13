import { createAppLogger } from "@freestyle-voice/utils";
import { generateText } from "ai";
import type { PluginLlm } from "freestyle-voice";
import { createChatModel, getDefaultModels } from "../providers.js";

const log = createAppLogger("plugins");

/**
 * Build the `PluginLlm` capability handed to plugin hooks, from whichever
 * model is currently configured for cleanup. Plugins never see the API key —
 * the model instance is resolved here, once per request, and only the
 * capability object is exposed.
 *
 * Returns `undefined` when no cleanup model is configured, or when the model
 * can't be resolved (missing key, unsupported provider) — plugins guard with
 * `if (api.llm)` rather than the host throwing mid-pipeline over an optional
 * capability.
 */
export async function buildPluginLlm(): Promise<PluginLlm | undefined> {
  const llm = getDefaultModels().llm;
  if (!llm) return undefined;

  let model: Awaited<ReturnType<typeof createChatModel>>;
  try {
    model = await createChatModel(llm.provider, llm.model_id);
  } catch (err) {
    log.debug(
      `plugin LLM capability unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }

  return {
    providerId: llm.provider,
    modelId: llm.model_id,
    getModel: () => model,
    async generateText({ prompt, system, signal }) {
      const result = await generateText({
        model,
        prompt,
        ...(system ? { system } : {}),
        ...(signal ? { abortSignal: signal } : {}),
      });
      return {
        text: result.text,
        ...(result.usage
          ? {
              usage: {
                inputTokens: result.usage.inputTokens ?? 0,
                outputTokens: result.usage.outputTokens ?? 0,
              },
            }
          : {}),
      };
    },
  };
}
