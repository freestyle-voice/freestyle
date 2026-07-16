import type { PluginConfig } from "./config.js";
import type { AppContext, FreestyleEvent } from "./events.js";
import type { HookApi } from "./hook-api.js";
import type { OutputMode } from "./output.js";

/**
 * A hook handler: receives read-only `input`, mutates `output` in place, and
 * gets a third {@link HookApi} argument for cancellation/suppression control
 * and (on server hooks) the host's LLM. Existing two-argument handlers remain
 * valid — the third parameter is optional to implement.
 */
export type Handler<I, O> = (
  input: I,
  output: O,
  api: HookApi,
) => void | Promise<void>;

/**
 * The set of hooks a plugin may implement. Every hook is optional. Hooks live
 * flat on the plugin object (Vite-style). For a given hook, all implementing
 * plugins run **in resolved order** (`enforce: "pre"` → none → `"post"`, then
 * load order within a band), each awaited in sequence — unless a plugin calls
 * `api.control.stopPropagation()` (stops later plugins for that hook only) or
 * `api.control.consume()` / `api.control.abort()` (stops the rest of the
 * pipeline entirely; the host checks `api.control.state` between stages).
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
   * [server] Fires at the top of the transcribe request, before speech-to-text
   * runs. Edit `output.audio` to preprocess the recorded audio, or override
   * `output.providerId`/`output.modelId`/`output.language`/`output.bias` to
   * change how this dictation is transcribed. Call `api.control.consume()` to
   * skip STT entirely (e.g. a plugin that handles the audio itself).
   */
  beforeTranscribe?: Handler<BeforeTranscribeInput, BeforeTranscribeOutput>;

  /**
   * [server] Fires immediately after speech-to-text produces a raw transcript
   * (after built-in sanitization, before LLM cleanup). Edit `output.text` to
   * rewrite the raw transcript, or call `api.control.consume()` to mark the
   * utterance handled and skip cleanup + delivery entirely (e.g. a
   * voice-command plugin that ran an action instead of dictating text).
   */
  afterTranscribe?: Handler<AfterTranscribeInput, { text: string }>;

  /**
   * [server] Fires while the LLM cleanup prompt is being assembled, only when
   * cleanup is enabled. Push additional system-prompt fragments, override the
   * inferred destination (overall/personal/work/email), replace the prompt
   * outright, or force plain-text passthrough for contextual correction.
   */
  beforeCleanup?: Handler<
    BeforeCleanupInput,
    {
      system: string[];
      destination?: CleanupToneDestination;
      /** Replace the assembled prompt outright, bypassing `system`. */
      prompt?: string;
      /** Skip LLM cleanup entirely for this dictation (dictionary + `afterCleanup` still run). */
      skip?: boolean;
    }
  >;

  /**
   * [server] The flagship text-rewrite seam. Always fires on the final text,
   * in the same stage as built-in dictionary replacement (whether or not
   * cleanup ran). Plugins form a chain: each receives the previous plugin's
   * `output.text`. Edit `output.text` to transform the final dictation.
   */
  afterCleanup?: Handler<AfterCleanupInput, { text: string }>;

  /**
   * [server] Fires just before final text is delivered to the user's focused
   * application — after any multi-segment merge, so `input`/`output` reflect
   * the text that will actually be delivered. Edit `output.text`, or switch
   * `output.mode` between pasting, copying, and suppressing delivery (`"none"`).
   */
  beforeOutput?: Handler<BeforeOutputInput, { text: string; mode: OutputMode }>;
}

/** The destination bucket used to steer contextual cleanup. */
export type CleanupToneDestination = "overall" | "personal" | "work" | "email";

export interface BeforeTranscribeInput {
  /** The resolved default voice provider id, before any plugin override. */
  readonly providerId: string;
  /** The resolved default voice model id, before any plugin override. */
  readonly modelId: string;
  /** Recorded audio duration in milliseconds, when known. */
  readonly audioDurationMs: number;
  /** Application the user was dictating into, if known. */
  readonly appContext?: AppContext;
}

export interface BeforeTranscribeOutput {
  /** The recorded audio. Replace to preprocess (denoise, trim, resample…). */
  audio: Uint8Array;
  /** Override which provider transcribes this dictation. */
  providerId: string;
  /** Override which model transcribes this dictation. */
  modelId: string;
  /** Override the language hint passed to the provider. */
  language?: string;
  /** Override or augment the ASR vocabulary bias for this dictation. */
  bias?: string[];
}

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
  /** The destination the built-in logic inferred, before plugin overrides. */
  destination: CleanupToneDestination;
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
