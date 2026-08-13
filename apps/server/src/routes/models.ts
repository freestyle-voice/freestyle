import { configureModelSchema } from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import {
  FREESTYLE_CLOUD_CLEANUP_MODEL_ID,
  FREESTYLE_CLOUD_PROVIDER_ID,
  FREESTYLE_CLOUD_TRANSCRIBE_MODEL_ID,
} from "../lib/freestyle-cloud.js";
import { capture } from "../lib/posthog.js";

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
  /**
   * Display name of the LLM gateway fronting this model (e.g. "OpenRouter"),
   * when the provider is an aggregator rather than a first-party vendor. The
   * picker shows this as a small badge next to the model.
   */
  gateway?: string;
}

const REGISTRY_FETCH_TIMEOUT_MS = 3000;

// Local voice models (curated + legacy that's still downloaded — the
// /available handler filters to ready models, so legacy entries only
// surface for installs that already have them on disk).
// Curated cloud voice catalog: one flagship per provider. The models.dev
// registry is deliberately NOT merged for voice — untested model noise.
const BUILTIN_VOICE_MODELS: AvailableModel[] = [
  {
    provider_id: FREESTYLE_CLOUD_PROVIDER_ID,
    provider_name: "Freestyle Transcribe",
    model_id: FREESTYLE_CLOUD_TRANSCRIBE_MODEL_ID,
    model_name: "Freestyle Transcribe",
    family: "freestyle",
    type: "voice",
  },
];

const BUILTIN_LLM_MODELS: AvailableModel[] = [
  {
    provider_id: FREESTYLE_CLOUD_PROVIDER_ID,
    provider_name: "Freestyle Transcribe",
    model_id: FREESTYLE_CLOUD_CLEANUP_MODEL_ID,
    model_name: "Freestyle Transcribe Cleanup",
    family: "freestyle",
    type: "llm",
    curated: true,
  },
];

// In-memory cache for models.dev data
let modelsCache: { data: unknown; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** True when the in-memory registry cache is present and unexpired. */
function isRegistryCacheFresh(): boolean {
  return !!modelsCache && Date.now() - modelsCache.fetchedAt < CACHE_TTL_MS;
}

async function fetchModelsFromRegistry(): Promise<Record<string, unknown>> {
  if (isRegistryCacheFresh()) {
    return (modelsCache as { data: unknown }).data as Record<string, unknown>;
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
 * Warm the models.dev registry cache in the background (fire-and-forget).
 * Called from the transcribe pre-warm route while the user is still speaking so
 * the per-dictation cost lookup ({@link getModelCostCached}) hits a warm cache
 * and never blocks the response on a network round-trip. No-op when the cache
 * is already fresh; swallows errors (cost is non-critical).
 */
export function prewarmModelCostRegistry(): void {
  if (isRegistryCacheFresh()) return;
  void fetchModelsFromRegistry().catch(() => {
    // Best-effort — a failed warm just means the next cost lookup returns null.
  });
}

/**
 * Pull per-token cost for a model out of an already-fetched registry object.
 * Costs in the registry are per-million tokens; returned values are per-token.
 * Provider is taken from the models.dev provider key, not parsed from model ID.
 */
function lookupCostInRegistry(
  registry: Record<string, unknown>,
  providerId: string,
  modelId: string,
): { input: number; output: number } | null {
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
}

/**
 * Synchronous, cache-only cost lookup for the transcription hot path. Never
 * triggers a network fetch: on a cold/expired cache it returns null (cost is
 * recorded as 0) rather than stalling the user-facing response on a models.dev
 * round-trip. Warm the cache ahead of time via {@link prewarmModelCostRegistry}.
 */
export function getModelCostCached(
  providerId: string,
  modelId: string,
): { input: number; output: number } | null {
  if (!isRegistryCacheFresh() || !modelsCache) return null;
  try {
    return lookupCostInRegistry(
      modelsCache.data as Record<string, unknown>,
      providerId,
      modelId,
    );
  } catch {
    return null;
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

const models = new Hono()
  .get("/available", async (c) => {
    try {
      const available: AvailableModel[] = [];

      // Cleanup LLMs come from the registry, restricted to providers the app
      // can actually run. Voice is curated-only (no registry merge). A registry
      // outage must not take the curated/local catalog down with it.
      available.push(...BUILTIN_LLM_MODELS);

      // Curated cloud voice models
      available.push(
        ...BUILTIN_VOICE_MODELS.map((m) => ({ ...m, curated: true })),
      );

      return c.json(available);
    } catch (err) {
      return c.json(
        { error: "Failed to fetch models", detail: String(err) },
        500,
      );
    }
  })
  .get("/configured", (c) => {
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
  .post("/configured", zValidator("json", configureModelSchema), (c) => {
    const db = getDb();
    const body = c.req.valid("json");

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
