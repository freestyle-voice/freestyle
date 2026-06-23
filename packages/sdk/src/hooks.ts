import type { PluginConfig } from "./config.js";
import type { AppContext, FreestyleEvent } from "./events.js";
import type { OutputMode } from "./output.js";

/** A hook handler: receives read-only `input`, mutates `output` in place. */
export type Handler<I, O> = (input: I, output: O) => void | Promise<void>;

/**
 * The set of hooks a plugin may implement. Every hook is optional. Hooks live
 * flat on the plugin object (Vite-style). For a given hook, all implementing
 * plugins run **in resolved order** (`enforce: "pre"` → none → `"post"`, then
 * load order within a band), each awaited in sequence.
 *
 * Mutating hooks receive a read-only `input` describing the situation and a
 * mutable `output` the plugin edits in place to influence behavior. Returning a
 * value is not required (and is ignored), except for `config`.
 *
 * Hooks are split by host process:
 * - Server hooks run inside the Freestyle server (the dictation backend).
 * - App hooks run inside the Electron main process (OS integration / output).
 */
export interface Hooks {
  /**
   * Observe pipeline events. Read-only: mutating `input.event` has no effect.
   * Runs in both processes for the events that process emits.
   */
  event?: (input: { event: FreestyleEvent }) => void | Promise<void>;

  /**
   * [server] Inspect and contribute configuration at server boot, after
   * settings have loaded. Return a partial config to be deep-merged in resolved
   * plugin order.
   */
  config?: (
    config: PluginConfig,
  ) => PluginConfig | undefined | Promise<PluginConfig | undefined>;

  /**
   * [server] Fires immediately after speech-to-text produces a raw transcript
   * (after built-in sanitization, before LLM cleanup). Edit `output.text` to
   * rewrite the raw transcript.
   */
  afterTranscribe?: Handler<AfterTranscribeInput, { text: string }>;

  /**
   * [server] Fires while the LLM cleanup prompt is being assembled, only when
   * cleanup is enabled. Push additional system-prompt fragments or override the
   * inferred writing register (formal/casual/neutral) for contextual
   * correction.
   */
  beforeCleanup?: Handler<
    BeforeCleanupInput,
    { system: string[]; register?: Register }
  >;

  /**
   * [server] The flagship text-rewrite seam. Always fires on the final text,
   * in the same stage as built-in dictionary replacement (whether or not
   * cleanup ran). Plugins form a chain: each receives the previous plugin's
   * `output.text`. Edit `output.text` to transform the final dictation.
   */
  afterCleanup?: Handler<AfterCleanupInput, { text: string }>;

  /**
   * [app] Fires in the Electron main process just before final text is
   * delivered to the focused application. Edit `output.text`, or switch
   * `output.mode` between pasting, copying, and suppressing delivery.
   */
  beforeOutput?: Handler<BeforeOutputInput, { text: string; mode: OutputMode }>;
}

/** Writing register used to steer contextual correction. */
export type Register = "formal" | "casual" | "neutral";

export interface AfterTranscribeInput {
  /** The provider id that produced this transcript (e.g. "openai"). */
  providerId: string;
  /** The model id used for transcription. */
  modelId: string;
  /** Application the user was dictating into, if known. */
  appContext?: AppContext;
}

export interface BeforeCleanupInput {
  /** The raw transcript about to be cleaned. */
  text: string;
  /** Application the user was dictating into, if known. */
  appContext?: AppContext;
  /** The register the built-in logic inferred, before plugin overrides. */
  inferredRegister: Register;
}

export interface AfterCleanupInput {
  /** Application the user was dictating into, if known. */
  appContext?: AppContext;
}

export interface BeforeOutputInput {
  /** Application receiving the text, if known. */
  appContext?: AppContext;
}

/** Names of every supported hook, useful for loaders/registries. */
export type HookName = keyof Hooks;
