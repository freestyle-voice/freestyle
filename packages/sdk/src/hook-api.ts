import type { PluginLlm } from "./llm.js";

/** Terminal state of a dictation's pipeline run. */
export type PipelineControlState = "running" | "consumed" | "aborted";

/**
 * Explicit cancellation/suppression control for a single dictation's pipeline
 * run, shared across every hook invoked for that dictation (`beforeTranscribe`
 * → `afterTranscribe` → `beforeCleanup` → `afterCleanup` → `beforeOutput`).
 *
 * Replaces the old convention of a plugin returning an empty string to signal
 * "nothing to deliver" — that was fragile (indistinguishable from a genuinely
 * empty transcript) and lost the raw text. Call {@link consume} or
 * {@link abort} instead; the host checks {@link state} between stages and
 * skips whatever remains.
 */
export class PipelineControl {
  private readonly controller = new AbortController();
  private _state: PipelineControlState = "running";
  private _reason: string | undefined;
  private _stopPropagation = false;

  /** The current terminal state. Starts `"running"`. */
  get state(): PipelineControlState {
    return this._state;
  }

  /** The reason passed to {@link consume} or {@link abort}, if any. */
  get reason(): string | undefined {
    return this._reason;
  }

  /**
   * Fires when {@link abort} is called. Pass to any cancellable work (e.g.
   * `api.llm.generateText({ signal })`) so it stops promptly.
   */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /**
   * Stop running the *remaining plugins for the current hook only* — later
   * hooks in the pipeline still run normally. Use this when a plugin wants to
   * be the last word for one stage without affecting the rest of the
   * pipeline.
   */
  stopPropagation(): void {
    this._stopPropagation = true;
  }

  /**
   * Mark the dictation as handled by this plugin: every remaining stage in the
   * pipeline is skipped and no output is delivered. Use this for plugins that
   * fully consume the utterance themselves (e.g. a voice-command plugin that
   * ran an action instead of dictating text).
   */
  consume(reason?: string): void {
    this._state = "consumed";
    this._reason = reason;
    this._stopPropagation = true;
  }

  /**
   * Hard-stop the pipeline: no output is delivered and the host reports a
   * `pipelineError` event with `reason`. Use this for unrecoverable plugin
   * failures that should not fall through to default behavior.
   */
  abort(reason?: string): void {
    this._state = "aborted";
    this._reason = reason;
    this._stopPropagation = true;
    this.controller.abort(reason);
  }

  /**
   * @internal Host-only. Reset the per-hook propagation flag before iterating
   * plugins for a new hook name. Does not affect {@link state}.
   */
  resetPropagationForNextHook(): void {
    this._stopPropagation = false;
  }

  /** @internal Host-only. Whether the current hook's iteration should stop. */
  get propagationStopped(): boolean {
    return this._stopPropagation;
  }
}

/**
 * The capabilities object every mutating hook receives as its third argument.
 * Built once per dictation and threaded through every stage, so `control` and
 * `llm` are consistent across the whole pipeline run.
 */
export interface HookApi {
  /** Cancellation + suppression control for this dictation. */
  readonly control: PipelineControl;
  /** Convenience alias for `control.signal`. */
  readonly signal: AbortSignal;
  /**
   * The host's configured LLM, when one is set up. `undefined` when no LLM is
   * configured — always guard with `if (api.llm)`. Only present for server
   * hooks (`beforeTranscribe`, `afterTranscribe`, `beforeCleanup`,
   * `afterCleanup`); never for `beforeOutput`.
   */
  readonly llm?: PluginLlm;
}

/** Build a {@link HookApi} around a fresh {@link PipelineControl}. */
export function createHookApi(overrides: { llm?: PluginLlm } = {}): HookApi {
  const control = new PipelineControl();
  return {
    control,
    signal: control.signal,
    ...(overrides.llm ? { llm: overrides.llm } : {}),
  };
}
