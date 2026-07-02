import process from "node:process";
import type { LanguageModel } from "ai";
import type { Plugin, PluginLlm, PluginLogger } from "freestyle-voice";
import { runAction } from "./actions.js";
import { runAgent } from "./agent.js";
import { createCommandsApi, type TestResult } from "./api.js";
import { PLUGIN_NAME } from "./constants.js";
import { matchCommands, normalize, stripTrigger } from "./prefilter.js";
import { CommandStore } from "./store.js";
import type { VoiceCommand } from "./types.js";

/**
 * Voice Commands — turn spoken trigger phrases into actions. A cheap
 * deterministic prefilter gates a multi-step tool-calling agent (reusing the
 * host's configured LLM); when a command fires, the utterance is `consumed` so
 * the host skips cleanup and delivers no text.
 */
export default function voiceCommands(): Plugin {
  const store = new CommandStore();
  let logger: PluginLogger | null = null;
  let llm: PluginLlm | null = null;

  /** Execute a single command's action with the extracted input. */
  const execute = (command: VoiceCommand, input: string): Promise<string> =>
    runAction(command.action, input, logger ?? nullLogger);

  /**
   * The full detection pipeline shared by the `afterTranscribe` hook and the
   * `/test` endpoint: prefilter, then either the LLM agent or a deterministic
   * fallback when no model is configured.
   */
  async function detect(text: string): Promise<TestResult> {
    const matched = matchCommands(text, store.list());
    const names = matched.map((c) => c.name);
    if (matched.length === 0) {
      return { matched: names, fired: false, llm: Boolean(llm) };
    }

    if (llm) {
      const result = await runAgent({
        model: llm.getModel() as LanguageModel,
        transcript: text,
        commands: matched,
        execute,
        logger: logger ?? nullLogger,
      });
      return { matched: names, llm: true, ...result };
    }

    // No LLM configured — fall back to firing the best deterministic match.
    const command = pickBestMatch(text, matched);
    const input = stripTrigger(text, command);
    try {
      const detail = await execute(command, input);
      return {
        matched: names,
        fired: true,
        command: command.name,
        detail,
        llm: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger?.error(`command "${command.name}" failed: ${message}`);
      return {
        matched: names,
        fired: true,
        command: command.name,
        detail: `Failed: ${message}`,
        llm: false,
      };
    }
  }

  const middleware = createCommandsApi({
    store,
    runTest: detect,
    platform: process.platform,
  });

  return {
    name: PLUGIN_NAME,
    middleware: [middleware],

    async setup(ctx) {
      logger = ctx.logger;
      llm = ctx.llm ?? null;
      await store.load(ctx.storage);
      logger.info(
        `voice-commands ready on ${ctx.mode} (${store.list().length} commands, llm=${
          llm ? llm.modelId : "none"
        })`,
      );
    },

    async afterTranscribe(_input, output) {
      const text = output.text?.trim();
      if (!text) return;
      const result = await detect(text);
      if (result.fired) {
        logger?.info(`voice command fired: ${result.command}`);
        output.consumed = true;
        output.text = "";
      }
    },
  };
}

/** Choose the candidate whose longest trigger phrase appears in the text. */
function pickBestMatch(text: string, matched: VoiceCommand[]): VoiceCommand {
  const hay = normalize(text);
  let best = matched[0];
  let bestLen = 0;
  for (const cmd of matched) {
    for (const trigger of cmd.triggers) {
      const needle = normalize(trigger);
      if (needle && hay.includes(needle) && needle.length > bestLen) {
        bestLen = needle.length;
        best = cmd;
      }
    }
  }
  return best;
}

const nullLogger: PluginLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
