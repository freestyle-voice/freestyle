import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import {
  LEGACY_MLX_ASR_MODELS,
  MLX_ASR_MODELS,
  MLX_ASR_PROVIDER_ID,
  MLX_ASR_PROVIDER_NAME,
} from "../lib/mlx-asr/constants.js";
import { getMlxModelStatus } from "../lib/mlx-asr/models.js";
import { reconcileUnsupportedMlxVoiceDefault } from "../lib/mlx-asr/reconcile.js";
import { canRunMlxAsr } from "../lib/mlx-asr/server.js";
import {
  buildOpenApiCompatibleHeaders,
  getNormalizedOpenApiCompatibleEndpoint,
  getOpenApiCompatibleProviderLabel,
} from "../lib/openapi-compatible.js";
import {
  getOpenRouterHeaders,
  OPENROUTER_API_BASE,
  OPENROUTER_PROVIDER_ID,
  OPENROUTER_PROVIDER_NAME,
  prefixOpenRouterModelId,
} from "../lib/openrouter.js";
import { capture } from "../lib/posthog.js";
import { stripProviderPrefix } from "../lib/streaming/types.js";
import { isServerBinaryAvailable } from "../lib/whisper/binary.js";
import {
  LEGACY_WHISPER_MODELS,
  WHISPER_MODELS,
  WHISPER_PROVIDER_ID,
} from "../lib/whisper/constants.js";
import { getModelStatus } from "../lib/whisper/models.js";
import { startInBackground } from "../lib/whisper/server.js";

interface AvailableModel {
  provider_id: string;
  provider_name: string;
  model_id: string;
  model_name: string;
  family: string;
  type: "voice" | "llm";
  cost_input?: number;
  cost_output?: number;
  /** Surfaced in the default picker; non-curated models live behind "All models". */
  curated?: boolean;
}

const DEPRECATED_STATUS = "deprecated";
const REGISTRY_FETCH_TIMEOUT_MS = 3000;
const OPENROUTER_FETCH_TIMEOUT_MS = 4000;
const UNSUITABLE_CLEANUP_MODEL_PATTERN =
  /guard|safeguard|safety|moderation|classif(?:y|ier|ication)?|embed(?:ding)?|image/i;

async function fetchLocalOpenApiModels(
  type: "voice" | "llm",
): Promise<AvailableModel[]> {
  const db = getDb();
  const urlRow = db
    .prepare("SELECT value FROM settings WHERE key = 'local_llm_url'")
    .get() as { value: string } | undefined;
  if (!urlRow?.value) return [];

  const keyRow = db
    .prepare("SELECT value FROM settings WHERE key = 'local_llm_api_key'")
    .get() as { value: string } | undefined;

  const endpoint = getNormalizedOpenApiCompatibleEndpoint(urlRow.value);
  if (!endpoint) return [];
  const apiKey = keyRow?.value?.trim() || undefined;

  const res = await fetch(`${endpoint}/models`, {
    headers: buildOpenApiCompatibleHeaders(endpoint, apiKey),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    data?: { id: string }[];
  };
  if (!data.data || !Array.isArray(data.data)) return [];

  const providerName = getOpenApiCompatibleProviderLabel(endpoint);

  return data.data.map((m) => ({
    provider_id: "local-llm",
    provider_name: providerName,
    model_id: `local-llm/${m.id}`,
    model_name: m.id,
    family: "openapi-compatible",
    type,
    cost_input: 0,
    cost_output: 0,
  }));
}

// Local voice models (curated + legacy that's still downloaded — the
// /available handler filters to ready models, so legacy entries only
// surface for installs that already have them on disk).
const LOCAL_WHISPER_VOICE_MODELS: AvailableModel[] = [
  ...WHISPER_MODELS,
  ...LEGACY_WHISPER_MODELS,
].map((m) => ({
  provider_id: WHISPER_PROVIDER_ID,
  provider_name: "Local Whisper",
  model_id: `${WHISPER_PROVIDER_ID}/${m.id}`,
  model_name: m.displayName,
  family: "whisper-local",
  type: "voice" as const,
  cost_input: 0,
  cost_output: 0,
}));

const LOCAL_MLX_VOICE_MODELS: AvailableModel[] = [
  ...MLX_ASR_MODELS,
  ...LEGACY_MLX_ASR_MODELS,
].map((m) => ({
  provider_id: MLX_ASR_PROVIDER_ID,
  provider_name: MLX_ASR_PROVIDER_NAME,
  model_id: `${MLX_ASR_PROVIDER_ID}/${m.id}`,
  model_name: m.displayName,
  family: m.family,
  type: "voice" as const,
  cost_input: 0,
  cost_output: 0,
}));

// Curated cloud voice catalog: one flagship per provider. The models.dev
// registry is deliberately NOT merged for voice — untested model noise.
const BUILTIN_VOICE_MODELS: AvailableModel[] = [
  {
    provider_id: "openai",
    provider_name: "OpenAI",
    model_id: "openai/gpt-4o-transcribe",
    model_name: "OpenAI Transcribe",
    family: "whisper",
    type: "voice",
  },
  {
    provider_id: "groq",
    provider_name: "Groq",
    model_id: "groq/whisper-large-v3-turbo",
    model_name: "Groq Whisper",
    family: "whisper",
    type: "voice",
  },
  {
    provider_id: "deepgram",
    provider_name: "Deepgram",
    model_id: "deepgram/nova-3",
    model_name: "Deepgram Nova 3",
    family: "deepgram",
    type: "voice",
  },
  {
    provider_id: "elevenlabs",
    provider_name: "ElevenLabs",
    model_id: "elevenlabs/scribe_v2_realtime",
    model_name: "ElevenLabs Scribe",
    family: "elevenlabs",
    type: "voice",
  },
];

// Cleanup-LLM providers the app can actually run (see lib/providers.ts).
const SUPPORTED_LLM_PROVIDERS = new Set([
  "openai",
  "anthropic",
  "google",
  "groq",
  "mistral",
]);

// One fast-tier cleanup model per provider, surfaced by default; everything
// else from the registry sits behind the picker's "All models" expander.
const CURATED_LLM_IDS = new Set([
  "groq/llama-3.3-70b-versatile",
  "openai/gpt-4o-mini",
  "anthropic/claude-haiku-4-5",
  "google/gemini-2.5-flash",
  "mistral/mistral-small-latest",
]);

// In-memory cache for models.dev data
let modelsCache: { data: unknown; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
let openRouterVoiceCache: { data: AvailableModel[]; fetchedAt: number } | null =
  null;

async function fetchModelsFromRegistry(): Promise<Record<string, unknown>> {
  if (modelsCache && Date.now() - modelsCache.fetchedAt < CACHE_TTL_MS) {
    return modelsCache.data as Record<string, unknown>;
  }

  const res = await fetch("https://models.dev/api.json", {
    signal: AbortSignal.timeout(REGISTRY_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch models.dev: ${res.status}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  modelsCache = { data, fetchedAt: Date.now() };
  return data;
}

interface OpenRouterModel {
  id: string;
  name: string;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
    modality?: string;
  };
}

async function fetchOpenRouterVoiceModels(): Promise<AvailableModel[]> {
  if (
    openRouterVoiceCache &&
    Date.now() - openRouterVoiceCache.fetchedAt < CACHE_TTL_MS
  ) {
    return openRouterVoiceCache.data;
  }

  const res = await fetch(
    `${OPENROUTER_API_BASE}/models?output_modalities=transcription`,
    {
      headers: getOpenRouterHeaders(),
      signal: AbortSignal.timeout(OPENROUTER_FETCH_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch OpenRouter models: ${res.status}`);
  }

  const data = (await res.json()) as { data?: OpenRouterModel[] };
  const models = (data.data ?? [])
    .filter((model) => {
      const input = model.architecture?.input_modalities ?? [];
      const output = model.architecture?.output_modalities ?? [];
      return input.includes("audio") && output.includes("transcription");
    })
    .map(
      (model): AvailableModel => ({
        provider_id: OPENROUTER_PROVIDER_ID,
        provider_name: OPENROUTER_PROVIDER_NAME,
        model_id: prefixOpenRouterModelId(model.id),
        model_name: model.name,
        family: model.id.split("/")[0] ?? "openrouter",
        type: "voice",
      }),
    )
    .sort((a, b) => a.model_name.localeCompare(b.model_name));

  openRouterVoiceCache = { data: models, fetchedAt: Date.now() };
  return models;
}

/**
 * Look up per-token cost from models.dev registry.
 * Returns { inputCostPerToken, outputCostPerToken } or null if not found.
 * Costs in the registry are per-million tokens.
 * Provider is taken from the models.dev provider key, not parsed from model ID.
 */
export async function getModelCost(
  providerId: string,
  modelId: string,
): Promise<{ input: number; output: number } | null> {
  try {
    const registry = await fetchModelsFromRegistry();

    const provider = registry[providerId] as RegistryProvider | undefined;
    if (!provider?.models) return null;

    const shortId = modelId.startsWith(`${providerId}/`)
      ? modelId.slice(providerId.length + 1)
      : modelId;
    const model = provider.models[modelId] ?? provider.models[shortId] ?? null;
    if (!model?.cost) return null;

    return {
      input: (model.cost.input ?? 0) / 1_000_000,
      output: (model.cost.output ?? 0) / 1_000_000,
    };
  } catch {
    return null;
  }
}

export async function isCleanupModelSupported(
  providerId: string,
  modelId: string,
): Promise<boolean> {
  if (providerId === "local-llm") return true;

  try {
    const registry = await fetchModelsFromRegistry();
    const provider = registry[providerId] as RegistryProvider | undefined;
    if (!provider?.models) return false;

    const shortId = modelId.startsWith(`${providerId}/`)
      ? modelId.slice(providerId.length + 1)
      : modelId;
    const model = provider.models[modelId] ?? provider.models[shortId] ?? null;
    if (!model) return false;

    const inputMods = model.modalities?.input ?? [];
    const outputMods = model.modalities?.output ?? [];
    return (
      model.status !== DEPRECATED_STATUS &&
      inputMods.includes("text") &&
      outputMods.includes("text") &&
      isCleanupSuitableModel(model)
    );
  } catch {
    return true;
  }
}

interface RegistryModel {
  id: string;
  name: string;
  family?: string;
  modalities?: { input?: string[]; output?: string[] };
  cost?: { input?: number; output?: number };
  status?: string;
  [key: string]: unknown;
}

interface RegistryProvider {
  id: string;
  name: string;
  models?: Record<string, RegistryModel>;
  [key: string]: unknown;
}

function isCleanupSuitableModel(model: RegistryModel): boolean {
  const searchable = [model.id, model.name, model.family ?? ""].join(" ");
  return !UNSUITABLE_CLEANUP_MODEL_PATTERN.test(searchable);
}

const models = new Hono()
  .get("/available", async (c) => {
    try {
      const available: AvailableModel[] = [];

      // Cleanup LLMs come from the registry, restricted to providers the app
      // can actually run. Voice is curated-only (no registry merge). A registry
      // outage must not take the curated/local catalog down with it.
      let registry: Record<string, unknown> = {};
      try {
        registry = await fetchModelsFromRegistry();
      } catch {
        // offline / models.dev unreachable — curated lists still work
      }
      for (const [providerId, providerData] of Object.entries(registry)) {
        if (!SUPPORTED_LLM_PROVIDERS.has(providerId)) continue;
        const provider = providerData as RegistryProvider;
        if (!provider.models) continue;

        for (const [, model] of Object.entries(provider.models)) {
          if (model.status === DEPRECATED_STATUS) continue;

          const inputMods = model.modalities?.input ?? [];
          const outputMods = model.modalities?.output ?? [];
          const isLLM =
            inputMods.includes("text") && outputMods.includes("text");

          if (isLLM && isCleanupSuitableModel(model)) {
            available.push({
              provider_id: providerId,
              provider_name: provider.name ?? providerId,
              model_id: model.id,
              model_name: model.name,
              family: model.family ?? "",
              type: "llm",
              cost_input: model.cost?.input,
              cost_output: model.cost?.output,
              curated: CURATED_LLM_IDS.has(`${providerId}/${model.id}`),
            });
          }
        }
      }

      // Curated cloud voice models
      available.push(
        ...BUILTIN_VOICE_MODELS.map((m) => ({ ...m, curated: true })),
      );

      try {
        available.push(...(await fetchOpenRouterVoiceModels()));
      } catch {
        // OpenRouter model discovery is optional.
      }

      // Add local whisper voice models (only those that are downloaded)
      for (const whisperModel of LOCAL_WHISPER_VOICE_MODELS) {
        const modelId = whisperModel.model_id.split("/")[1];
        const status = getModelStatus(modelId);
        if (status?.status === "ready") {
          available.push({ ...whisperModel, curated: true });
        }
      }

      if (canRunMlxAsr()) {
        for (const mlxModel of LOCAL_MLX_VOICE_MODELS) {
          const modelId = mlxModel.model_id.split("/")[1];
          const status = getMlxModelStatus(modelId);
          if (status?.status === "ready") {
            available.push({ ...mlxModel, curated: true });
          }
        }
      }

      try {
        const localLlmModels = await fetchLocalOpenApiModels("llm");
        const localVoiceModels = await fetchLocalOpenApiModels("voice");
        // The user explicitly connected this server — everything it serves is curated.
        available.push(
          ...localLlmModels.map((m) => ({ ...m, curated: true })),
          ...localVoiceModels.map((m) => ({ ...m, curated: true })),
        );
      } catch {
        // Local OpenAPI-compatible server not reachable
      }

      return c.json(available);
    } catch (err) {
      return c.json(
        { error: "Failed to fetch models", detail: String(err) },
        500,
      );
    }
  })
  .get("/configured", (c) => {
    reconcileUnsupportedMlxVoiceDefault();
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT id, provider, model_id, model_name, type, is_default, created_at FROM model_configs ORDER BY type, is_default DESC, created_at DESC",
      )
      .all() as {
      id: number;
      provider: string;
      model_id: string;
      model_name: string;
      type: string;
      is_default: number;
      created_at: string;
    }[];
    return c.json(rows);
  })
  .post("/configured", async (c) => {
    const db = getDb();
    const body = await c.req.json<{
      provider: string;
      model_id: string;
      model_name: string;
      type: "voice" | "llm";
      is_default?: boolean;
    }>();

    if (!body.provider || !body.model_id || !body.model_name || !body.type) {
      return c.json(
        { error: "provider, model_id, model_name, and type are required" },
        400,
      );
    }

    // If setting as default, unset any existing default for this type
    if (body.is_default) {
      db.prepare("UPDATE model_configs SET is_default = 0 WHERE type = ?").run(
        body.type,
      );
    }

    const result = db
      .prepare(
        `INSERT INTO model_configs (provider, model_id, model_name, type, is_default)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(provider, model_id, type) DO UPDATE SET
           model_name = excluded.model_name,
           is_default = excluded.is_default`,
      )
      .run(
        body.provider,
        body.model_id,
        body.model_name,
        body.type,
        body.is_default ? 1 : 0,
      );

    capture("model configured", {
      provider: body.provider,
      model_id: body.model_id,
      model_name: body.model_name,
      type: body.type,
      is_default: body.is_default ?? false,
    });

    return c.json({ id: result.lastInsertRowid, ...body }, 201);
  })
  .put("/configured/:id/default", (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));

    const row = db
      .prepare(
        "SELECT type, provider, model_id FROM model_configs WHERE id = ?",
      )
      .get(id) as
      | { type: string; provider: string; model_id: string }
      | undefined;
    if (!row) {
      return c.json({ error: "Model config not found" }, 404);
    }

    // Unset existing default for this type, then set new one
    db.prepare("UPDATE model_configs SET is_default = 0 WHERE type = ?").run(
      row.type,
    );
    db.prepare("UPDATE model_configs SET is_default = 1 WHERE id = ?").run(id);

    capture("default model changed", {
      type: row.type,
      provider: row.provider,
      model_id: row.model_id,
    });

    // Pre-warm the local whisper server so the first transcription after a
    // model switch doesn't pay the model-load latency.
    if (
      row.type === "voice" &&
      row.provider === WHISPER_PROVIDER_ID &&
      isServerBinaryAvailable()
    ) {
      startInBackground(stripProviderPrefix(row.model_id));
    }

    return c.json({ ok: true });
  })
  .delete("/configured/:id", (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));

    const row = db
      .prepare(
        "SELECT provider, model_id, type FROM model_configs WHERE id = ?",
      )
      .get(id) as
      | { provider: string; model_id: string; type: string }
      | undefined;

    db.prepare("DELETE FROM model_configs WHERE id = ?").run(id);

    if (row) {
      capture("model deleted", {
        provider: row.provider,
        model_id: row.model_id,
        type: row.type,
      });
    }

    return c.json({ ok: true });
  });

export default models;
