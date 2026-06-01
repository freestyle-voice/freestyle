import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import {
  MLX_ASR_MODELS,
  MLX_ASR_PROVIDER_ID,
  MLX_ASR_PROVIDER_NAME,
} from "../lib/mlx-asr/constants.js";
import { getMlxModelStatus } from "../lib/mlx-asr/models.js";
import { reconcileUnsupportedMlxVoiceDefault } from "../lib/mlx-asr/reconcile.js";
import { canRunMlxAsr } from "../lib/mlx-asr/server.js";
import { capture } from "../lib/posthog.js";
import {
  WHISPER_MODELS,
  WHISPER_PROVIDER_ID,
} from "../lib/whisper/constants.js";
import { getModelStatus } from "../lib/whisper/models.js";

interface AvailableModel {
  provider_id: string;
  provider_name: string;
  model_id: string;
  model_name: string;
  family: string;
  type: "voice" | "llm";
  cost_input?: number;
  cost_output?: number;
}

const DEPRECATED_STATUS = "deprecated";
const REGISTRY_FETCH_TIMEOUT_MS = 3000;
const UNSUITABLE_CLEANUP_MODEL_PATTERN =
  /guard|safeguard|safety|moderation|classif(?:y|ier|ication)?|embed(?:ding)?|image/i;

async function fetchLocalLlmModels(): Promise<AvailableModel[]> {
  const db = getDb();
  const urlRow = db
    .prepare("SELECT value FROM settings WHERE key = 'local_llm_url'")
    .get() as { value: string } | undefined;
  if (!urlRow?.value) return [];

  const keyRow = db
    .prepare("SELECT value FROM settings WHERE key = 'local_llm_api_key'")
    .get() as { value: string } | undefined;

  const baseUrl = urlRow.value.replace(/\/+$/, "").replace(/\/v1$/, "");

  const res = await fetch(`${baseUrl}/v1/models`, {
    headers: {
      ...(keyRow?.value ? { Authorization: `Bearer ${keyRow.value}` } : {}),
    },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    data?: { id: string }[];
  };
  if (!data.data || !Array.isArray(data.data)) return [];

  return data.data.map((m) => ({
    provider_id: "local-llm",
    provider_name: "Local LLM",
    model_id: `local-llm/${m.id}`,
    model_name: m.id,
    family: "local",
    type: "llm" as const,
    cost_input: 0,
    cost_output: 0,
  }));
}

// Speech-to-text model families from models.dev
const STT_FAMILIES = new Set(["whisper", "deepgram"]);

// Local Whisper voice models (generated from constants)
const LOCAL_WHISPER_VOICE_MODELS: AvailableModel[] = WHISPER_MODELS.map(
  (m) => ({
    provider_id: WHISPER_PROVIDER_ID,
    provider_name: "Local Whisper",
    model_id: `${WHISPER_PROVIDER_ID}/${m.id}`,
    model_name: `${m.displayName} (Local)`,
    family: "whisper-local",
    type: "voice" as const,
    cost_input: 0,
    cost_output: 0,
  }),
);

const LOCAL_MLX_VOICE_MODELS: AvailableModel[] = MLX_ASR_MODELS.map((m) => ({
  provider_id: MLX_ASR_PROVIDER_ID,
  provider_name: MLX_ASR_PROVIDER_NAME,
  model_id: `${MLX_ASR_PROVIDER_ID}/${m.id}`,
  model_name: m.displayName,
  family: m.family,
  type: "voice" as const,
  cost_input: 0,
  cost_output: 0,
}));

// Hardcoded transcription models for providers missing from models.dev registry
const BUILTIN_VOICE_MODELS: AvailableModel[] = [
  {
    provider_id: "openai",
    provider_name: "OpenAI",
    model_id: "openai/whisper-1",
    model_name: "Whisper V2",
    family: "whisper",
    type: "voice",
  },
  {
    provider_id: "openai",
    provider_name: "OpenAI",
    model_id: "openai/gpt-4o-transcribe",
    model_name: "GPT-4o Transcribe",
    family: "whisper",
    type: "voice",
  },
  {
    provider_id: "openai",
    provider_name: "OpenAI",
    model_id: "openai/gpt-4o-mini-transcribe",
    model_name: "GPT-4o Mini Transcribe",
    family: "whisper",
    type: "voice",
  },
  {
    provider_id: "deepgram",
    provider_name: "Deepgram",
    model_id: "deepgram/nova-3",
    model_name: "Nova 3",
    family: "deepgram",
    type: "voice",
  },
  {
    provider_id: "deepgram",
    provider_name: "Deepgram",
    model_id: "deepgram/nova-2",
    model_name: "Nova 2",
    family: "deepgram",
    type: "voice",
  },
  {
    provider_id: "elevenlabs",
    provider_name: "ElevenLabs",
    model_id: "elevenlabs/scribe_v1",
    model_name: "Scribe V1",
    family: "elevenlabs",
    type: "voice",
  },
  {
    provider_id: "elevenlabs",
    provider_name: "ElevenLabs",
    model_id: "elevenlabs/scribe_v2",
    model_name: "Scribe V2",
    family: "elevenlabs",
    type: "voice",
  },
  {
    provider_id: "elevenlabs",
    provider_name: "ElevenLabs",
    model_id: "elevenlabs/scribe_v2_realtime",
    model_name: "Scribe V2 Realtime",
    family: "elevenlabs",
    type: "voice",
  },
];

// In-memory cache for models.dev data
let modelsCache: { data: unknown; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
      const registry = await fetchModelsFromRegistry();
      const available: AvailableModel[] = [];

      // Track builtin model IDs so we don't duplicate
      const builtinIds = new Set(BUILTIN_VOICE_MODELS.map((m) => m.model_id));

      for (const [providerId, providerData] of Object.entries(registry)) {
        const provider = providerData as RegistryProvider;
        if (!provider.models) continue;

        for (const [, model] of Object.entries(provider.models)) {
          if (model.status === DEPRECATED_STATUS) continue;

          const family = model.family ?? "";
          const inputMods = model.modalities?.input ?? [];
          const outputMods = model.modalities?.output ?? [];

          // STT voice models: audio input + text output, or known STT families
          const isSTT =
            (STT_FAMILIES.has(family) &&
              inputMods.includes("audio") &&
              outputMods.includes("text")) ||
            (inputMods.includes("audio") && outputMods.includes("text"));

          // LLM models: text input + text output
          const isLLM =
            inputMods.includes("text") && outputMods.includes("text");

          if (isSTT && !builtinIds.has(model.id)) {
            available.push({
              provider_id: providerId,
              provider_name: provider.name ?? providerId,
              model_id: model.id,
              model_name: model.name,
              family,
              type: "voice",
              cost_input: model.cost?.input,
              cost_output: model.cost?.output,
            });
          }

          if (isLLM && isCleanupSuitableModel(model)) {
            available.push({
              provider_id: providerId,
              provider_name: provider.name ?? providerId,
              model_id: model.id,
              model_name: model.name,
              family,
              type: "llm",
              cost_input: model.cost?.input,
              cost_output: model.cost?.output,
            });
          }
        }
      }

      // Add builtin voice models
      available.push(...BUILTIN_VOICE_MODELS);

      // Add local whisper voice models (only those that are downloaded)
      for (const whisperModel of LOCAL_WHISPER_VOICE_MODELS) {
        const modelId = whisperModel.model_id.split("/")[1];
        const status = getModelStatus(modelId);
        if (status?.status === "ready") {
          available.push(whisperModel);
        }
      }

      if (canRunMlxAsr()) {
        for (const mlxModel of LOCAL_MLX_VOICE_MODELS) {
          const modelId = mlxModel.model_id.split("/")[1];
          const status = getMlxModelStatus(modelId);
          if (status?.status === "ready") {
            available.push(mlxModel);
          }
        }
      }

      try {
        const localModels = await fetchLocalLlmModels();
        available.push(...localModels);
      } catch {
        // Local LLM server not reachable
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
