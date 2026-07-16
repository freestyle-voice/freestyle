import { generateText, type LanguageModel, stepCountIs, tool } from "ai";
import type { PluginLogger } from "freestyle-voice";
import { z } from "zod";
import type { VoiceCommand } from "./types.js";

/** Outcome of a detection run: whether a command fired, and which. */
export interface AgentResult {
  fired: boolean;
  command?: string;
  detail?: string;
}

const SYSTEM_PROMPT = `You are the command router for a voice dictation app.
The user just spoke an utterance that matched one or more command triggers.
Decide whether the utterance is genuinely a request to run one of the available
commands, or just ordinary dictation that happens to contain a trigger word.

- If it clearly maps to a command, call that command's tool exactly once. Pass
  the relevant payload from the utterance as "input" — strip the trigger/wake
  words and keep only the meaningful content (e.g. the message body, the query,
  the note text). If there is no payload, pass an empty string.
- If it is ordinary dictation and NOT a command, do not call any tool and reply
  with the single word: none.

Never call more than one tool.`;

/**
 * Run the multi-step tool-calling agent over the candidate commands. Each
 * command is exposed as a tool whose `execute` runs the real action. Returns
 * whether a command fired. The model reuses the host's configured LLM.
 */
export async function runAgent(opts: {
  model: LanguageModel;
  transcript: string;
  commands: VoiceCommand[];
  execute: (command: VoiceCommand, input: string) => Promise<string>;
  logger: PluginLogger;
}): Promise<AgentResult> {
  const { model, transcript, commands, execute, logger } = opts;

  const result: AgentResult = { fired: false };

  const tools = Object.fromEntries(
    commands.map((command) => [
      command.id,
      tool({
        description: `${command.name}. Triggers: ${command.triggers.join(
          ", ",
        )}. ${command.description}`.trim(),
        inputSchema: z.object({
          input: z
            .string()
            .describe(
              "The payload extracted from the utterance (trigger words removed). Empty string if none.",
            ),
        }),
        execute: async ({ input }) => {
          logger.info(`agent chose "${command.name}" (input="${input}")`);
          try {
            const detail = await execute(command, input);
            result.fired = true;
            result.command = command.name;
            result.detail = detail;
            return detail;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(`command "${command.name}" failed: ${message}`);
            // Report to the model, but still mark as fired so the utterance is
            // consumed — the user issued a command; it just failed to execute.
            result.fired = true;
            result.command = command.name;
            result.detail = `Failed: ${message}`;
            return `The command failed: ${message}`;
          }
        },
      }),
    ]),
  );

  logger.debug(
    `agent: calling model with ${commands.length} tool(s) [${commands
      .map((c) => c.id)
      .join(", ")}]`,
  );

  try {
    const { steps, finishReason } = await generateText({
      model,
      tools,
      stopWhen: stepCountIs(3),
      system: SYSTEM_PROMPT,
      prompt: `Utterance: "${transcript}"`,
    });
    logger.debug(
      `agent: model finished (steps=${steps.length}, finishReason=${finishReason})`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`agent: model call failed: ${message}`);
    if (err instanceof Error && err.stack) logger.debug(err.stack);
    // Surface a clear, actionable message to the caller (the /test endpoint
    // returns it to the UI; afterTranscribe logs and ignores it).
    throw new Error(`LLM agent failed: ${message}`);
  }

  return result;
}
