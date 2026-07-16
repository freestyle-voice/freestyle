import {
  FreestyleEventType,
  type HookApi,
  type PipelineControlState,
  type PipelineStage,
  createHookApi as sdkCreateHookApi,
} from "freestyle-voice";
import { plugins } from "./index.js";
import { buildPluginLlm } from "./llm.js";

/**
 * Build the {@link HookApi} for one server-side pipeline run (one dictation).
 * Reuse the same instance across every stage of that dictation
 * (`beforeTranscribe` → `afterTranscribe` → `beforeCleanup` → `afterCleanup`)
 * so `api.control` carries state between them — a plugin calling
 * `api.control.consume()` in `afterTranscribe` should be visible to the route
 * handler when it checks `api.control.state` before running cleanup.
 *
 * Building the LLM capability resolves the configured chat model once per
 * request; failures (no key, unsupported provider) degrade to `llm: undefined`
 * rather than failing the whole request.
 */
export async function createHookApi(): Promise<HookApi> {
  const llm = await buildPluginLlm();
  return sdkCreateHookApi({ llm });
}

/**
 * A {@link HookApi} for the `beforeOutput` stage, which the SDK contract says
 * never receives the LLM capability. Skips resolving a chat model (the work
 * {@link createHookApi} does) since it would only be discarded.
 */
export function createOutputHookApi(): HookApi {
  return sdkCreateHookApi();
}

/** Response-facing disposition, derived from a dictation's control state. */
export type Disposition = "deliver" | "suppressed" | "aborted";

/** Map a terminal {@link PipelineControlState} to the response disposition. */
export function dispositionFromControl(
  state: PipelineControlState,
): Disposition {
  if (state === "consumed") return "suppressed";
  if (state === "aborted") return "aborted";
  return "deliver";
}

/**
 * Emit a `pipelineError` event when a plugin aborted the dictation, so the
 * documented `abort()` semantics ("the host reports a `pipelineError` event
 * with `reason`") hold on every terminal path. No-op unless aborted.
 */
export function emitAbortEvent(api: HookApi, stage: PipelineStage): void {
  if (api.control.state !== "aborted") return;
  void plugins().emit({
    type: FreestyleEventType.PipelineError,
    stage,
    message: api.control.reason ?? "aborted",
  });
}
