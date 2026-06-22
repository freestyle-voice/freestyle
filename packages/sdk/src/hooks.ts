import type { AppContext, FreestyleEvent, OutputMode } from "./events.js";

/**
 * The set of hooks a plugin may implement. Every hook is optional and async.
 * For a given hook, all implementing plugins run **in load order**, each
 * awaited in sequence. Mutating hooks receive a frozen-ish `input` describing
 * the situation and a mutable `output` the plugin edits in place to influence
 * behavior. Returning a value is not required (and is ignored).
 *
 * Hooks are split by host process:
 * - Server hooks run inside the Freestyle server (the dictation backend).
 * - App hooks run inside the Electron main process (OS integration / output).
 *
 * A single plugin module may implement hooks from both groups; each loader
 * only invokes the hooks belonging to its process.
 */
export interface Hooks {
  /**
   * Called once when the plugin is torn down (server/app shutdown). Use it to
   * release timers, sockets, or file handles.
   */
  dispose?: () => Promise<void> | void;

  /**
   * Observe pipeline events. Read-only: mutating `input.event` has no effect.
   * Runs in both processes for events that process emits.
   */
  event?: (input: { event: FreestyleEvent }) => Promise<void> | void;

  /**
   * [server] Inspect and adjust resolved configuration at server boot, after
   * settings have loaded. Mutate `output` in place.
   */
  config?: (output: PluginConfig) => Promise<void> | void;

  /**
   * [server] Fires immediately after speech-to-text produces a raw transcript
   * (after built-in sanitization, before LLM cleanup). Edit `output.text` to
   * rewrite the raw transcript.
   */
  "transcribe.after"?: (
    input: TranscribeAfterInput,
    output: { text: string },
  ) => Promise<void> | void;

  /**
   * [server] Fires while the LLM cleanup prompt is being assembled. Push
   * additional system-prompt fragments or override the inferred writing
   * register (formal/casual/neutral) for contextual correction.
   */
  "cleanup.prompt"?: (
    input: CleanupPromptInput,
    output: { system: string[]; register?: Register },
  ) => Promise<void> | void;

  /**
   * [server] The flagship text-rewrite seam. Fires on the final cleaned text,
   * in the same stage as built-in dictionary replacement. Plugins form a
   * chain: each receives the previous plugin's `output.text`. Edit
   * `output.text` to transform the final dictation.
   */
  "text.transform"?: (
    input: TextTransformInput,
    output: { text: string },
  ) => Promise<void> | void;

  /**
   * [app] Fires in the Electron main process just before final text is
   * delivered to the focused application. Edit `output.text` or switch
   * `output.mode` between pasting and copying.
   */
  "output.before"?: (
    input: OutputBeforeInput,
    output: { text: string; mode: OutputMode },
  ) => Promise<void> | void;
}

/** Writing register used to steer contextual correction. */
export type Register = "formal" | "casual" | "neutral";

/**
 * Configuration surfaced to the `config` hook. Intentionally a loose,
 * open-ended record in V1 so the contract can grow without breaking plugins.
 */
export interface PluginConfig {
  [key: string]: unknown;
}

export interface TranscribeAfterInput {
  /** The provider id that produced this transcript (e.g. "openai"). */
  providerId: string;
  /** The model id used for transcription. */
  modelId: string;
  /** Application the user was dictating into, if known. */
  appContext?: AppContext;
}

export interface CleanupPromptInput {
  /** The raw transcript about to be cleaned. */
  text: string;
  /** Application the user was dictating into, if known. */
  appContext?: AppContext;
  /** The register the built-in logic inferred, before plugin overrides. */
  inferredRegister: Register;
}

export interface TextTransformInput {
  /** Application the user was dictating into, if known. */
  appContext?: AppContext;
}

export interface OutputBeforeInput {
  /** Application receiving the text, if known. */
  appContext?: AppContext;
}

/** Names of every supported hook, useful for loaders/registries. */
export type HookName = keyof Hooks;
