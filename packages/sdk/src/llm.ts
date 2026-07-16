/**
 * The host's configured LLM, exposed to server-side hooks so plugins can do
 * their own LLM-backed work (classification, summarization, generation)
 * without bundling an API key or managing a provider themselves.
 *
 * Plugins never see credentials: the host resolves the provider, model, and
 * key internally and hands back only this capability. `getModel()` returns
 * the underlying model instance typed as `unknown` so the SDK never depends on
 * a specific AI SDK version — cast it yourself if you need direct access
 * (e.g. `getModel() as LanguageModel` from the `ai` package).
 */
export interface PluginLlm {
  /** The provider id currently configured for cleanup (e.g. `"openai"`). */
  readonly providerId: string;
  /** The model id currently configured (e.g. `"gpt-4o-mini"`). */
  readonly modelId: string;
  /** The underlying AI SDK model instance. Typed `unknown` — cast as needed. */
  getModel(): unknown;
  /** Convenience wrapper over the host's `generateText` call. */
  generateText(
    opts: PluginLlmGenerateOptions,
  ): Promise<PluginLlmGenerateResult>;
}

export interface PluginLlmGenerateOptions {
  /** The user prompt. */
  prompt: string;
  /** An optional system prompt. */
  system?: string;
  /** Abort the generation early, e.g. `api.signal` from the hook. */
  signal?: AbortSignal;
}

export interface PluginLlmGenerateResult {
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
