import {
  type HookApi,
  createHookApi as sdkCreateHookApi,
} from "freestyle-voice";
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
