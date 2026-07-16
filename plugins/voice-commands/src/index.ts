import process from "node:process";
import type { LanguageModel } from "ai";
import type { Plugin, PluginLlm, PluginLogger } from "freestyle-voice";
import { runAction } from "./actions.js";
import { runAgent } from "./agent.js";
import { createCommandsApi } from "./api.js";
import { PLUGIN_NAME } from "./constants.js";
import { matchCommands, normalize, stripTrigger } from "./prefilter.js";
import { CommandStore } from "./store.js";
import type { DetectionResult, VoiceCommand } from "./types.js";

/**
 * Voice Commands — turn spoken trigger phrases into actions. A cheap
 * deterministic prefilter gates a multi-step tool-calling agent (reusing the
 * host's configured LLM); when a command fires, the utterance is `consumed` so
 * the host skips cleanup and delivers no text.
 */
export default function voiceCommands(): Plugin {
  const store = new CommandStore();
  // Starts as a no-op logger and is replaced with the host logger in `setup`;
  // the API and hooks read it lazily so early calls never hit a null.
  let logger: PluginLogger = nullLogger;

  /** Execute a single command's action with the extracted input. */
  const execute = (command: VoiceCommand, input: string): Promise<string> => {
    logger.info(`executing "${command.name}" action=${command.action.type}`);
    return runAction(command.action, input, logger);
  };

  /**
   * The full detection pipeline: prefilter, then either the multi-step LLM
   * agent (when the host exposes one via `api.llm`) or a deterministic fallback
   * when no model is available. The LLM is passed in per-dictation rather than
   * captured at setup — the host builds it fresh for each pipeline run and
   * hands it to the hook on `api.llm`.
   */
  async function detect(
    text: string,
    llm: PluginLlm | null,
  ): Promise<DetectionResult> {
    const matched = matchCommands(text, store.list());
    const names = matched.map((c) => c.name);
    logger.debug(
      `prefilter: ${matched.length}/${store.list().length} command(s) matched${
        names.length ? ` [${names.join(", ")}]` : ""
      }`,
    );
    if (matched.length === 0) {
      return { matched: names, fired: false, llm: Boolean(llm) };
    }

    if (llm) {
      try {
        // Resolve the model lazily here so a misconfigured/unsupported provider
        // throws inside this try and degrades to the deterministic path rather
        // than aborting detection entirely.
        const model = llm.getModel() as LanguageModel;
        logger.info(
          `running agent (model=${llm.providerId}/${llm.modelId}) over ${matched.length} candidate(s)`,
        );
        const result = await runAgent({
          model,
          transcript: text,
          commands: matched,
          execute,
          logger,
        });
        logger.info(
          result.fired
            ? `agent fired "${result.command}"`
            : "agent decided: not a command",
        );
        return { matched: names, llm: true, ...result };
      } catch (err) {
        // The LLM was advertised but is unusable (bad key, unsupported model,
        // network failure). Don't drop the command — fall through to the
        // deterministic match so a clear trigger phrase still fires.
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(
          `LLM agent unavailable (${message}) — using deterministic fallback`,
        );
      }
    }

    // No usable LLM — fall back to firing the best deterministic match.
    const command = pickBestMatch(text, matched);
    const input = stripTrigger(text, command);
    logger.info(`deterministic fallback firing "${command.name}"`);
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
      logger.error(`command "${command.name}" failed: ${message}`);
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
    platform: process.platform,
    getLogger: () => logger,
  });

  return {
    name: PLUGIN_NAME,
    middleware: [middleware],

    async setup(ctx) {
      logger = ctx.logger;
      await store.load(ctx.storage);
      logger.info(
        `voice-commands ready on ${ctx.mode} (${store.list().length} commands)`,
      );
    },

    async afterTranscribe(_input, output, api) {
      const text = output.text?.trim();
      if (!text) return;
      try {
        const result = await detect(text, api.llm ?? null);
        if (result.fired) {
          logger.info(`voice command consumed utterance: ${result.command}`);
          // Mark the utterance handled: the host skips cleanup and delivers no
          // text (the command already ran the action).
          api.control.consume(`voice command: ${result.command}`);
        }
      } catch (err) {
        // Never let a detection failure break the dictation pipeline — log it
        // and fall through so the raw transcript is delivered as normal text.
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`afterTranscribe detection failed: ${message}`);
        if (err instanceof Error && err.stack) logger.debug(err.stack);
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
