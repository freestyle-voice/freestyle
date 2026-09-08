import { FREESTYLE_CLOUD_PROVIDER_ID } from "./freestyle-cloud.js";
import { getDefaultModels } from "./providers.js";

export type RemixRuntime =
  | { kind: "managed" }
  | {
      kind: "local";
      model: { provider: string; model_id: string; model_name: string };
    };

/** Remix is Cloud-managed unless the user explicitly selects their own model. */
export function getRemixRuntime(): RemixRuntime {
  const model = getDefaultModels().remix;
  if (!model || model.provider === FREESTYLE_CLOUD_PROVIDER_ID)
    return { kind: "managed" };
  return { kind: "local", model };
}
