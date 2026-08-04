import { createAppLogger } from "@freestyle-voice/utils";
import {
  REMIX_CLIENT_TOOLS,
  type RemixAgentRequest,
} from "@freestyle-voice/validations";
import {
  convertToModelMessages,
  type FlexibleSchema,
  stepCountIs,
  streamText,
  type ToolSet,
  tool,
  type UIMessage,
} from "ai";
import { buildRemixAgentSystem } from "./editor/remix-prompts.js";
import { getLlmProvider } from "./llm/registry.js";
import { capture } from "./posthog.js";
import { createChatModel } from "./providers.js";

const log = createAppLogger("remix-agent");

/** Primitive tools mean more, smaller steps: a canvas-app edit costs 6-8
 * calls before verification. A run that hasn't converged in 16 is lost. */
export const REMIX_MAX_STEPS = 16;

/**
 * The client-side tools, as AI SDK declarations. No `execute`: the loop
 * pauses at the call, the call streams to the renderer, the renderer executes
 * it against the document and re-sends the thread with the result appended.
 */
export function remixClientTools(): ToolSet {
  return Object.fromEntries(
    Object.entries(REMIX_CLIENT_TOOLS).map(([name, def]) => [
      name,
      tool({
        description: def.description,
        // The per-tool schema types are a union across the map; the cast keeps
        // tool()'s generic from collapsing it to never. Validation still runs
        // against each tool's own zod schema at call time.
        inputSchema: def.inputSchema as FlexibleSchema<Record<string, unknown>>,
      }),
    ]),
  );
}

export interface ByokModelChoice {
  provider: string;
  model_id: string;
}

/**
 * The agent loop on the user's own model. Identical shape to the cloud run —
 * same system prompt, same client tools — minus the server tools (web search
 * is a cloud capability) and minus metering.
 */
export async function runRemixAgentLocally(
  request: RemixAgentRequest,
  llm: ByokModelChoice,
  abortSignal: AbortSignal | undefined,
): Promise<Response> {
  const providerOptions = getLlmProvider(llm.provider)?.providerOptions?.(
    llm.model_id,
  );
  const started = Date.now();

  const result = streamText({
    model: await createChatModel(llm.provider, llm.model_id),
    system: buildRemixAgentSystem(request.context),
    messages: await convertToModelMessages(request.messages as UIMessage[]),
    tools: remixClientTools(),
    stopWhen: stepCountIs(REMIX_MAX_STEPS),
    abortSignal,
    ...(providerOptions ? { providerOptions } : {}),
    onError: ({ error }) => {
      log.error(`Remix agent (BYOK) stream error: ${error}`);
    },
    onFinish: ({ usage }) => {
      capture("remix agent completed", {
        provider: llm.provider,
        model: llm.model_id,
        duration_ms: Date.now() - started,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
      });
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      log.error(
        `Remix agent (BYOK) failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return "Remix failed.";
    },
  });
}
