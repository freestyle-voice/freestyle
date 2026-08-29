import { createAppLogger } from "@freestyle-voice/utils";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

const log = createAppLogger("local-agent");

const LOCAL_AGENT_SYSTEM_PROMPT = `You are Freestyle, a helpful desktop assistant.

Answer directly and concisely. You are running on the user's locally configured model. You do not have access to web search, connected apps, files, or desktop controls, so never claim to have used them. If a request needs one of those capabilities, say what is unavailable and offer the best answer you can from the conversation.`;

export interface LocalAgentModelChoice {
  provider: "local-llm";
  modelId: string;
}

/**
 * Run the same UI-message streaming protocol as the Cloud agent, but entirely
 * against the user's configured OpenAI-compatible local endpoint. It is
 * intentionally text-only: Cloud-only durable actions, connected apps, and
 * desktop tools must never be advertised by a local model that cannot execute
 * them.
 */
export async function runLocalAgent(
  messages: unknown[],
  model: LocalAgentModelChoice,
  abortSignal: AbortSignal | undefined,
): Promise<Response> {
  const { createConfiguredModel } = await import("./providers.js");
  const result = streamText({
    model: await createConfiguredModel(model.provider, model.modelId),
    system: LOCAL_AGENT_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages as UIMessage[]),
    stopWhen: stepCountIs(8),
    abortSignal,
    onError: ({ error }) => {
      log.error(`Local agent stream error: ${error}`);
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      log.error(
        `Local agent failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return "The local model couldn't complete that response.";
    },
  });
}
