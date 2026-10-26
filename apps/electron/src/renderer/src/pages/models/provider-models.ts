import type { AvailableModel } from "@renderer/lib/models";
import { displayProviderName } from "@renderer/lib/models";
import { CLEANUP_API_PROVIDERS } from "./cleanup-model-choice";

/** An unverified saved key can be tried; a known invalid key needs repair. */
export function connectedProviderIds(
  keys: { provider: string; status: string }[],
): Set<string> {
  return new Set(
    keys.filter((key) => key.status !== "invalid").map((key) => key.provider),
  );
}

export function filterProviderModels(
  catalog: AvailableModel[],
  connected: Set<string>,
  selected: string[],
  search: string,
  browseAll = false,
): AvailableModel[] {
  const query = search.trim().toLowerCase();
  return catalog.filter(
    (model) =>
      CLEANUP_API_PROVIDERS.includes(model.provider_id) &&
      (browseAll || connected.has(model.provider_id)) &&
      (selected.length === 0 || selected.includes(model.provider_id)) &&
      (!query ||
        `${model.model_name} ${model.model_id} ${model.provider_name} ${model.gateway ?? ""}`
          .toLowerCase()
          .includes(query)),
  );
}

/** Catalog IDs are native; configured IDs contain exactly one app routing prefix. */
export function withConfiguredCleanupModels(
  catalog: AvailableModel[],
  configured: {
    provider: string;
    model_id: string;
    model_name: string;
    type: string;
  }[],
): AvailableModel[] {
  const result = [...catalog];
  for (const model of configured) {
    if (
      (model.type !== "llm" && model.type !== "remix") ||
      !CLEANUP_API_PROVIDERS.includes(model.provider)
    )
      continue;
    const prefix = `${model.provider}/`;
    const nativeId = model.model_id.startsWith(prefix)
      ? model.model_id.slice(prefix.length)
      : model.model_id;
    if (
      result.some(
        (item) =>
          item.provider_id === model.provider && item.model_id === nativeId,
      )
    )
      continue;
    result.push({
      provider_id: model.provider,
      provider_name: displayProviderName(model.provider),
      model_id: nativeId,
      model_name: model.model_name,
      type: "llm",
      ...(["openrouter", "vercel"].includes(model.provider)
        ? { gateway: displayProviderName(model.provider) }
        : {}),
    });
  }
  return result;
}
