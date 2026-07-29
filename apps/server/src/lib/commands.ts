import {
  maxOutputTokensForCleanup,
  stripWrappingQuotes,
} from "@freestyle-voice/stt";
import { createAppLogger } from "@freestyle-voice/utils";
import { findCommandPreset } from "@freestyle-voice/validations";
import { generateText } from "ai";
import { isCleanupModelSupported } from "../routes/models.js";
import {
  buildCommandPrompt,
  buildCommandSystem,
} from "./editor/command-prompts.js";
import { ensureCleanupPromptConfigFresh } from "./editor/prompt-config.js";
import {
  FREESTYLE_CLOUD_PROVIDER_ID,
  FreestyleCloudAuthError,
  isTransientCloudError,
  postProcessWithFreestyleCloud,
} from "./freestyle-cloud.js";
import { getLlmProvider } from "./llm/registry.js";
import { capture, captureException } from "./posthog.js";
import { createChatModel, getDefaultModels } from "./providers.js";
import { getSessionToken } from "./sessions.js";

const log = createAppLogger("commands");

/** A command run failed in a way the pill should show the user. */
export class CommandError extends Error {
  constructor(
    message: string,
    /** Distinguishes "you need to set something up" from "it broke". */
    readonly kind: "no-model" | "unsupported-model" | "failed" = "failed",
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export interface RunCommandOptions {
  text: string;
  /** A preset id, when the user picked one off the list. */
  commandId?: string;
  /** What the user said, when they didn't. */
  instruction?: string;
  language?: string;
}

/**
 * Resolve the edit to perform. A preset id wins over a spoken instruction when
 * both are present (the id can only come from the pill's own list, so it is
 * the more trustworthy of the two), and an unknown id falls back to the spoken
 * text rather than failing — a client shipping a preset this server doesn't
 * know about is a version skew, not a reason to lose the user's command.
 */
function resolveInstruction(options: RunCommandOptions): string | null {
  if (options.commandId) {
    const preset = findCommandPreset(options.commandId);
    if (preset) return preset.instruction;
  }
  const spoken = options.instruction?.trim();
  return spoken ? spoken : null;
}

/**
 * Run one command over a text selection and return the replacement text.
 *
 * Unlike dictation cleanup, this never falls back to returning the input
 * unchanged: the caller pastes the result straight over the user's selection,
 * and a silent no-op there is indistinguishable from a command that decided
 * nothing needed changing. Failures throw so the pill can say so.
 */
export async function runCommand(options: RunCommandOptions): Promise<string> {
  void ensureCleanupPromptConfigFresh();

  const instruction = resolveInstruction(options);
  if (!instruction) {
    throw new CommandError("No command was given", "failed");
  }

  const llm = getDefaultModels().llm;
  if (!llm) {
    throw new CommandError(
      "No AI model is set up yet. Pick one in Settings > Models.",
      "no-model",
    );
  }

  const started = Date.now();
  let text: string;

  if (llm.provider === FREESTYLE_CLOUD_PROVIDER_ID) {
    // Freestyle Cloud assembles prompts server-side and owns the user half, but
    // its "custom" intensity takes the system prompt verbatim — which is
    // exactly the shape `buildCommandSystem` is written for. Every tone is
    // pinned off so no cleanup register block is layered on top of the command.
    const token = getSessionToken();
    if (!token) throw new FreestyleCloudAuthError();
    const result = await postProcessWithFreestyleCloud({
      token,
      text: options.text,
      appContext: null,
      language: options.language,
      intensity: "custom",
      customPrompt: buildCommandSystem({
        instruction,
        language: options.language,
      }),
      personalTone: "off",
      workTone: "off",
      emailTone: "off",
      overallTone: "off",
      appAssignments: [],
    });
    text = result.cleaned;
  } else {
    if (!(await isCleanupModelSupported(llm.provider, llm.model_id))) {
      throw new CommandError(
        `${llm.model_id} can't run commands. Pick a different model in Settings > Models.`,
        "unsupported-model",
      );
    }
    const { system, prompt } = buildCommandPrompt(options.text, {
      instruction,
      language: options.language,
    });
    // Called directly rather than through the shared cleanup helper: that one
    // sanitizes transcript artifacts (collapsing a duplicated trailing
    // paragraph, in particular) which would quietly eat a repeated line from a
    // legitimately list-shaped result, and it swallows model errors into a
    // raw-text fallback this path must not take.
    const providerOptions = getLlmProvider(llm.provider)?.providerOptions?.(
      llm.model_id,
    );
    const result = await generateText({
      model: await createChatModel(llm.provider, llm.model_id),
      system,
      prompt,
      temperature: 0,
      // The budget is sized off the input, which is the right shape here too —
      // an edit is roughly as long as what it edits. "Expand" is the exception,
      // and the helper already leaves generous headroom.
      maxOutputTokens: maxOutputTokensForCleanup(options.text),
      ...(providerOptions ? { providerOptions } : {}),
    });
    text = result.text;
  }

  // Models like to hand back a rewrite in quotes even when told not to. The
  // rest of the transcript sanitizer is deliberately not applied here.
  text = stripWrappingQuotes(text);

  if (!text.trim()) {
    throw new CommandError("The model returned nothing", "failed");
  }

  capture("command completed", {
    command_id: options.commandId ?? "voice",
    spoken: !options.commandId,
    provider: llm.provider,
    model: llm.model_id,
    duration_ms: Date.now() - started,
    input_chars: options.text.length,
    output_chars: text.length,
  });

  return text;
}

/** Shared failure bookkeeping for the route's catch-all. */
export function reportCommandFailure(err: unknown, commandId?: string): void {
  if (!isTransientCloudError(err)) captureException(err);
  capture("command failed", { command_id: commandId ?? "voice" });
  log.error(`Command failed: ${err}`);
}
