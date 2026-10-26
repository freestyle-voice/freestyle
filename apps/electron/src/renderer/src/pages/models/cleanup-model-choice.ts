import {
  type AvailableModel,
  displayProviderName,
  LLM_PROVIDERS,
} from "@renderer/lib/models";

/** BYOK choices are available even when remote catalog discovery is offline. */
export const CLEANUP_API_PROVIDERS = LLM_PROVIDERS.filter(
  (provider) => provider !== "freestyle-cloud" && provider !== "local-llm",
);

export function manualCleanupModel(
  provider: string,
  input: string,
  endpointConfigured = false,
): AvailableModel | null {
  const nativeId = input.trim();
  if (
    (!CLEANUP_API_PROVIDERS.includes(provider) && provider !== "local-llm") ||
    (provider === "local-llm" && !endpointConfigured) ||
    !nativeId ||
    /\s/.test(nativeId)
  )
    return null;
  return {
    provider_id: provider,
    provider_name: displayProviderName(provider),
    // Add one app routing prefix. The complete native ID, including a vendor
    // namespace such as `openrouter/auto`, must survive its removal at runtime.
    model_id: `${provider}/${nativeId}`,
    model_name: nativeId,
    type: "llm",
    curated: true,
  };
}

export function matchesCleanupModel(
  model: AvailableModel,
  selected: { provider: string; model_id: string } | undefined,
): boolean {
  return (
    selected?.provider === model.provider_id &&
    (selected.model_id === model.model_id ||
      selected.model_id === `${model.provider_id}/${model.model_id}`)
  );
}

export function withSelectedCleanupModel(
  catalog: AvailableModel[],
  selected:
    | { provider: string; model_id: string; model_name: string }
    | undefined,
): AvailableModel[] {
  if (
    !selected ||
    !CLEANUP_API_PROVIDERS.includes(selected.provider) ||
    catalog.some((model) => matchesCleanupModel(model, selected))
  )
    return catalog;
  return [
    ...catalog,
    {
      provider_id: selected.provider,
      provider_name: displayProviderName(selected.provider),
      model_id: selected.model_id,
      model_name: selected.model_name,
      type: "llm",
      curated: true,
    },
  ];
}
