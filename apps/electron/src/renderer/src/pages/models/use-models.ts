import { getClient } from "@renderer/lib/api";
import type {
  AvailableModel,
  MlxAsrStatus,
  VoiceItem,
  WhisperStatus,
} from "@renderer/lib/models";
import { IS_MAC } from "@renderer/lib/platform";
import { SETTINGS_QUERY_KEY, settingsQueryOptions } from "@renderer/lib/query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SETTINGS_KEYS } from "../../../../shared/settings-keys";
import { DEFAULT_MLX_KEEP_ALIVE_MINUTES } from "./constants";
import type { ApiKeyEntry, ConfiguredModel } from "./types";
import {
  buildSettingsVoiceItems,
  clampMlxKeepAliveMinutes,
  groupByProvider,
} from "./utils";

// Query keys for the models page. `["models", ...]` is a family so a single
// invalidate refreshes both available + configured.
const MODELS_KEYS = {
  available: ["models", "available"] as const,
  configured: ["models", "configured"] as const,
  keys: ["api-keys"] as const,
  settings: SETTINGS_QUERY_KEY,
  whisper: ["whisper-status"] as const,
  mlx: ["mlx-status"] as const,
};

// Stable empty fallbacks so derived useMemo deps don't change identity while a
// query is still loading.
const EMPTY_AVAILABLE: AvailableModel[] = [];
const EMPTY_CONFIGURED: ConfiguredModel[] = [];
const EMPTY_KEYS: ApiKeyEntry[] = [];

/** True while any local model is downloading or verifying. */
function hasActiveDownload(
  models: { status: string }[] | undefined | null,
): boolean {
  return !!models?.some(
    (m) => m.status === "downloading" || m.status === "verifying",
  );
}

/**
 * Connection state for an OpenAI-compatible endpoint (local LLM or custom
 * STT). The form fields themselves live in react-hook-form inside the connect
 * component; the hook owns the persisted seed values and the async test that
 * saves the settings then probes the endpoint.
 */
export interface EndpointConnectState {
  /** Persisted URL, used to seed the form once settings resolve. */
  initialUrl: string;
  /** Persisted API key, used to seed the form once settings resolve. */
  initialApiKey: string;
  testing: boolean;
  connected: boolean | null;
  error: string | null;
  models: string[];
  test: (values: { url: string; apiKey: string }) => Promise<void>;
  clearStatus: () => void;
}

export interface UseModels {
  loading: boolean;
  available: AvailableModel[];
  configured: ConfiguredModel[];
  apiKeys: ApiKeyEntry[];
  whisperStatus: WhisperStatus | null;
  mlxStatus: MlxAsrStatus | null;
  llmCleanup: boolean;
  /** True once the editable form state has been seeded from persisted settings. */
  settingsSeeded: boolean;
  mlxKeepAliveMinutes: number;

  /** Local models with an in-flight delete, keyed `${engine ?? "whisper"}:${defId}`. */
  deletingKeys: Set<string>;
  /** Providers with an in-flight key/model delete. */
  deletingProviders: Set<string>;

  // Derived
  keyProviders: Set<string>;
  defaultVoice: ConfiguredModel | undefined;
  defaultLlm: ConfiguredModel | undefined;
  voiceItems: VoiceItem[];
  llmModelsByProvider: Map<
    string,
    { providerName: string; models: AvailableModel[] }
  >;

  localLlm: EndpointConnectState;
  openaiStt: EndpointConnectState;

  // Actions — each refetches as needed
  configureModel: (
    model: AvailableModel,
    type: "voice" | "llm",
  ) => Promise<void>;
  saveKey: (provider: string, key: string) => Promise<string | null>;
  selectLocalVoice: (
    defId: string,
    name: string,
    engine?: "whisper" | "mlx",
  ) => Promise<void>;
  retryLocalMlx: (defId: string) => Promise<void>;
  downloadLocal: (defId: string, engine?: "whisper" | "mlx") => void;
  cancelLocal: (defId: string, engine?: "whisper" | "mlx") => void;
  deleteLocal: (defId: string, engine?: "whisper" | "mlx") => Promise<void>;
  selectLocalLlmModel: (modelName: string) => Promise<void>;
  setCleanup: (next: boolean) => void;
  saveMlxKeepAliveMinutes: (minutes: number) => void;
  deleteProvider: (provider: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function useModels(): UseModels {
  const queryClient = useQueryClient();

  // -------------------------------------------------------------------------
  // Server data (React Query)
  // -------------------------------------------------------------------------

  const availableQuery = useQuery({
    queryKey: MODELS_KEYS.available,
    queryFn: async () => {
      const res = await getClient().api.models.available.$get();
      if (!res.ok) throw new Error("Failed to load available models");
      return (await res.json()) as AvailableModel[];
    },
  });

  const configuredQuery = useQuery({
    queryKey: MODELS_KEYS.configured,
    queryFn: async () => {
      const res = await getClient().api.models.configured.$get();
      if (!res.ok) throw new Error("Failed to load configured models");
      return (await res.json()) as ConfiguredModel[];
    },
  });

  const keysQuery = useQuery({
    queryKey: MODELS_KEYS.keys,
    queryFn: async () => {
      const res = await getClient().api.keys.$get();
      if (!res.ok) throw new Error("Failed to load API keys");
      return (await res.json()) as ApiKeyEntry[];
    },
  });

  const settingsQuery = useQuery(settingsQueryOptions());

  const whisperQuery = useQuery({
    queryKey: MODELS_KEYS.whisper,
    queryFn: async () => {
      const res = await getClient().api.whisper.status.$get();
      if (!res.ok) throw new Error("Failed to load whisper status");
      return (await res.json()) as WhisperStatus;
    },
    // Poll every 500ms while a download/verify is active, then stop.
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && (d.binaryDownloading || hasActiveDownload(d.models))
        ? 500
        : false;
    },
    // Status is volatile during downloads — always treat as stale.
    staleTime: 0,
  });

  const mlxQuery = useQuery({
    queryKey: MODELS_KEYS.mlx,
    enabled: IS_MAC,
    queryFn: async () => {
      const res = await getClient().api["mlx-asr"].status.$get();
      if (!res.ok) throw new Error("Failed to load MLX ASR status");
      return (await res.json()) as MlxAsrStatus;
    },
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && hasActiveDownload(d.models) ? 500 : false;
    },
    staleTime: 0,
  });

  const available = availableQuery.data ?? EMPTY_AVAILABLE;
  const configured = configuredQuery.data ?? EMPTY_CONFIGURED;
  const apiKeys = keysQuery.data ?? EMPTY_KEYS;
  const whisperStatus = whisperQuery.data ?? null;
  const mlxStatus = mlxQuery.data ?? null;
  const loading =
    availableQuery.isLoading ||
    configuredQuery.isLoading ||
    keysQuery.isLoading ||
    settingsQuery.isLoading;

  // -------------------------------------------------------------------------
  // Editable form state (seeded from persisted settings)
  // -------------------------------------------------------------------------

  const [llmCleanup, setLlmCleanup] = useState(false);
  const [mlxKeepAliveMinutes, setMlxKeepAliveMinutes] = useState(
    DEFAULT_MLX_KEEP_ALIVE_MINUTES,
  );

  // In-flight deletes — drive spinners on the delete buttons since deletion has
  // no server-reported status the way downloads do.
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());
  const [deletingProviders, setDeletingProviders] = useState<Set<string>>(
    new Set(),
  );

  // Local LLM (Ollama / LM Studio) connection. The editable url/key fields live
  // in the connect component's react-hook-form; the hook keeps the persisted
  // seed values plus the transient connection status.
  const [localInitialUrl, setLocalInitialUrl] = useState(
    "http://localhost:11434",
  );
  const [localInitialApiKey, setLocalInitialApiKey] = useState("");
  const [localTesting, setLocalTesting] = useState(false);
  const [localConnected, setLocalConnected] = useState<boolean | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localModels, setLocalModels] = useState<string[]>([]);

  // Custom OpenAI-compatible STT endpoint — same connection pattern as local LLM.
  const [sttInitialUrl, setSttInitialUrl] = useState("");
  const [sttInitialApiKey, setSttInitialApiKey] = useState("");
  const [sttTesting, setSttTesting] = useState(false);
  const [sttConnected, setSttConnected] = useState<boolean | null>(null);
  const [sttError, setSttError] = useState<string | null>(null);
  const [sttModels, setSttModels] = useState<string[]>([]);

  // Seed editable state from persisted settings once, when the settings query
  // first resolves. Mutations update this local state directly, so we don't
  // re-seed on later invalidations (which would clobber in-progress edits).
  // keepAlive falls back to the MLX status report when the setting is unset.
  // `settingsSeeded` is state (not a ref) so consumers can wait for the seed
  // before acting on `llmCleanup` — reading it too early sees the initial
  // `false` and can trigger spurious re-configuration.
  const [settingsSeeded, setSettingsSeeded] = useState(false);
  const seededRef = useRef({ keepAlive: false });
  useEffect(() => {
    const s = settingsQuery.data;
    if (!s || settingsSeeded) return;
    setSettingsSeeded(true);
    const cleanup = s[SETTINGS_KEYS.llmCleanup];
    if (cleanup) setLlmCleanup(cleanup === "true");
    const url = s[SETTINGS_KEYS.localLlmUrl];
    if (url) setLocalInitialUrl(url);
    const key = s[SETTINGS_KEYS.localLlmApiKey];
    if (key) setLocalInitialApiKey(key);
    setSttInitialUrl(s[SETTINGS_KEYS.openaiSttBaseUrl] ?? "");
    setSttInitialApiKey(s[SETTINGS_KEYS.openaiSttApiKey] ?? "");
    const rawMinutes = s[SETTINGS_KEYS.mlxAsrKeepAliveMinutes];
    if (rawMinutes) {
      const minutes = Number(rawMinutes);
      if (Number.isFinite(minutes)) {
        seededRef.current.keepAlive = true;
        setMlxKeepAliveMinutes(clampMlxKeepAliveMinutes(minutes));
      }
    }
  }, [settingsQuery.data, settingsSeeded]);

  useEffect(() => {
    const d = mlxQuery.data;
    if (!d || seededRef.current.keepAlive) return;
    seededRef.current.keepAlive = true;
    if (Number.isFinite(d.keepAliveMinutes)) {
      setMlxKeepAliveMinutes(clampMlxKeepAliveMinutes(d.keepAliveMinutes));
    }
  }, [mlxQuery.data]);

  // -------------------------------------------------------------------------
  // Reloaders (invalidate the relevant queries; polling is driven by
  // refetchInterval on the whisper/mlx queries above)
  // -------------------------------------------------------------------------

  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["models"] }),
      queryClient.invalidateQueries({ queryKey: MODELS_KEYS.keys }),
      queryClient.invalidateQueries({ queryKey: MODELS_KEYS.settings }),
    ]);
  }, [queryClient]);
  const loadData = reload;

  const loadWhisperStatus = useCallback(
    () => queryClient.invalidateQueries({ queryKey: MODELS_KEYS.whisper }),
    [queryClient],
  );

  // MLX retry needs the fresh status synchronously, so this fetches directly
  // and primes the query cache rather than just invalidating.
  const loadMlxStatus = useCallback(
    async (refresh = false): Promise<MlxAsrStatus | null> => {
      try {
        const res = refresh
          ? await getClient().api["mlx-asr"].status.$get({
              query: { refresh: "1" },
            })
          : await getClient().api["mlx-asr"].status.$get();
        if (!res.ok) return null;
        const data = (await res.json()) as MlxAsrStatus;
        queryClient.setQueryData(MODELS_KEYS.mlx, data);
        return data;
      } catch (err) {
        console.error("Failed to load MLX ASR status:", err);
        return null;
      }
    },
    [queryClient],
  );

  // When an active download/verify transitions to done, refresh the model
  // lists (a freshly downloaded local model becomes selectable).
  const whisperActive =
    !!whisperStatus &&
    (whisperStatus.binaryDownloading ||
      hasActiveDownload(whisperStatus.models));
  const prevWhisperActive = useRef(false);
  useEffect(() => {
    if (prevWhisperActive.current && !whisperActive) {
      void queryClient.invalidateQueries({ queryKey: ["models"] });
    }
    prevWhisperActive.current = whisperActive;
  }, [whisperActive, queryClient]);

  const mlxActive = hasActiveDownload(mlxStatus?.models);
  const prevMlxActive = useRef(false);
  useEffect(() => {
    if (prevMlxActive.current && !mlxActive) {
      void queryClient.invalidateQueries({ queryKey: ["models"] });
    }
    prevMlxActive.current = mlxActive;
  }, [mlxActive, queryClient]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const keyProviders = useMemo(
    () => new Set(apiKeys.map((k) => k.provider)),
    [apiKeys],
  );
  const defaultVoice = useMemo(
    () => configured.find((m) => m.type === "voice" && m.is_default === 1),
    [configured],
  );
  const defaultLlm = useMemo(
    () => configured.find((m) => m.type === "llm" && m.is_default === 1),
    [configured],
  );
  const llmModelsByProvider = useMemo(
    () => groupByProvider(available, "llm"),
    [available],
  );
  const voiceItems = useMemo(
    () =>
      buildSettingsVoiceItems(available, whisperStatus, mlxStatus, {
        defaultVoice,
        keyProviders,
      }),
    [available, whisperStatus, mlxStatus, defaultVoice, keyProviders],
  );

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const configureModel = useCallback(
    async (model: AvailableModel, type: "voice" | "llm") => {
      await getClient().api.models.configured.$post({
        json: {
          provider: model.provider_id,
          model_id: model.model_id,
          model_name: model.model_name,
          type,
          is_default: true,
        },
      });
      await loadData();
    },
    [loadData],
  );

  // Validate, then persist. Returns an error string, or null on success.
  const saveKey = useCallback(
    async (provider: string, key: string): Promise<string | null> => {
      try {
        const client = getClient();
        const valRes = await client.api.keys.validate.$post({
          json: { provider, key },
        });
        if (valRes.ok) {
          const body = await valRes.json();
          if ("valid" in body && body.valid === false) {
            return (
              ("error" in body && typeof body.error === "string"
                ? body.error
                : null) ?? "API key is not valid."
            );
          }
        }
        await client.api.keys.$post({ json: { provider, key } });
        await loadData();
        return null;
      } catch {
        return "Failed to validate key. Please try again.";
      }
    },
    [loadData],
  );

  const selectLocalVoice = useCallback(
    async (defId: string, name: string, engine?: "whisper" | "mlx") => {
      const provider = engine === "mlx" ? "local-mlx" : "local-whisper";
      await getClient().api.models.configured.$post({
        json: {
          provider,
          model_id: `${provider}/${defId}`,
          model_name: name,
          type: "voice",
          is_default: true,
        },
      });
      if (engine === "mlx") {
        getClient()
          .api["mlx-asr"].server.start.$post({ json: { modelId: defId } })
          .catch(() => {});
      } else {
        getClient()
          .api.whisper.server.start.$post({ json: { modelId: defId } })
          .catch(() => {});
      }
      await loadData();
    },
    [loadData],
  );

  const downloadLocal = useCallback(
    (defId: string, engine?: "whisper" | "mlx") => {
      if (engine === "mlx") {
        void getClient()
          .api["mlx-asr"].models[":model"].download.$post({
            param: { model: defId },
          })
          .then(() => loadMlxStatus());
      } else {
        void getClient()
          .api.whisper.models[":model"].download.$post({
            param: { model: defId },
          })
          .then(() => loadWhisperStatus());
      }
    },
    [loadMlxStatus, loadWhisperStatus],
  );

  const cancelLocal = useCallback(
    (defId: string, engine?: "whisper" | "mlx") => {
      if (engine === "mlx") {
        void getClient()
          .api["mlx-asr"].models[":model"].cancel.$post({
            param: { model: defId },
          })
          .then(() => loadMlxStatus());
      } else {
        void getClient()
          .api.whisper.models[":model"].cancel.$post({
            param: { model: defId },
          })
          .then(() => loadWhisperStatus());
      }
    },
    [loadMlxStatus, loadWhisperStatus],
  );

  const deleteLocal = useCallback(
    async (defId: string, engine?: "whisper" | "mlx") => {
      const deletingKey = `${engine ?? "whisper"}:${defId}`;
      setDeletingKeys((prev) => new Set(prev).add(deletingKey));
      try {
        if (engine === "mlx") {
          await getClient().api["mlx-asr"].models[":model"].$delete({
            param: { model: defId },
          });
          await loadMlxStatus();
        } else {
          await getClient().api.whisper.models[":model"].$delete({
            param: { model: defId },
          });
          await loadWhisperStatus();
        }
        await loadData();
      } finally {
        setDeletingKeys((prev) => {
          const next = new Set(prev);
          next.delete(deletingKey);
          return next;
        });
      }
    },
    [loadMlxStatus, loadWhisperStatus, loadData],
  );

  const retryLocalMlx = useCallback(
    async (defId: string) => {
      const data = await loadMlxStatus(true);
      if (!data?.canRun) return;
      const status = data.models?.find((m) => m.model === defId);
      if (status?.status !== "ready") {
        downloadLocal(defId, "mlx");
        return;
      }
      const name =
        data.modelDefinitions.find((m) => m.id === defId)?.displayName ?? defId;
      await selectLocalVoice(defId, name, "mlx");
    },
    [loadMlxStatus, downloadLocal, selectLocalVoice],
  );

  const selectLocalLlmModel = useCallback(
    async (modelName: string) => {
      await getClient().api.models.configured.$post({
        json: {
          provider: "local-llm",
          model_id: `local-llm/${modelName}`,
          model_name: modelName,
          type: "llm",
          is_default: true,
        },
      });
      await loadData();
    },
    [loadData],
  );

  const setCleanup = useCallback((next: boolean) => {
    setLlmCleanup(next);
    getClient()
      .api.settings[":key"].$put({
        param: { key: SETTINGS_KEYS.llmCleanup },
        json: { value: String(next) },
      })
      .catch((err) => console.error("Failed to save LLM cleanup:", err));
  }, []);

  // Persist the MLX keep-alive window. At 0 ("cold start") also stop the
  // running server so the model unloads immediately.
  const saveMlxKeepAliveMinutes = useCallback((minutes: number) => {
    const next = clampMlxKeepAliveMinutes(minutes);
    setMlxKeepAliveMinutes(next);
    getClient()
      .api.settings[":key"].$put({
        param: { key: SETTINGS_KEYS.mlxAsrKeepAliveMinutes },
        json: { value: String(next) },
      })
      .then(() => {
        if (next !== 0) return;
        return getClient().api["mlx-asr"].server.stop.$post();
      })
      .catch((err) => console.error("Failed to save MLX ASR keep-alive:", err));
  }, []);

  const deleteProvider = useCallback(
    async (provider: string) => {
      setDeletingProviders((prev) => new Set(prev).add(provider));
      try {
        const client = getClient();
        await client.api.keys[":provider"].$delete({ param: { provider } });
        const providerModels = configured.filter(
          (m) => m.provider === provider,
        );
        await Promise.all(
          providerModels.map((m) =>
            client.api.models.configured[":id"].$delete({
              param: { id: String(m.id) },
            }),
          ),
        );
        await loadData();
      } finally {
        setDeletingProviders((prev) => {
          const next = new Set(prev);
          next.delete(provider);
          return next;
        });
      }
    },
    [configured, loadData],
  );

  // -------------------------------------------------------------------------
  // Local LLM connection test
  // -------------------------------------------------------------------------

  const clearLocalStatus = useCallback(() => {
    setLocalConnected(null);
    setLocalError(null);
  }, []);

  const testLocalLlm = useCallback(
    async (values: { url: string; apiKey: string }) => {
      setLocalTesting(true);
      setLocalConnected(null);
      setLocalError(null);
      try {
        const url = values.url.replace(/\/+$/, "");
        const key = values.apiKey.trim();
        const client = getClient();
        await Promise.all([
          client.api.settings[":key"].$put({
            param: { key: SETTINGS_KEYS.localLlmUrl },
            json: { value: url },
          }),
          key
            ? client.api.settings[":key"].$put({
                param: { key: SETTINGS_KEYS.localLlmApiKey },
                json: { value: key },
              })
            : client.api.settings[":key"].$delete({
                param: { key: SETTINGS_KEYS.localLlmApiKey },
              }),
        ]);

        const res = await client.api.settings["local-llm"].test.$post({
          json: { url, api_key: key || undefined },
        });

        if (res.ok) {
          const result = await res.json();
          if ("ok" in result && result.ok) {
            setLocalConnected(true);
            setLocalModels(result.models ?? []);
            await loadData();
            return;
          }
          setLocalConnected(false);
          setLocalError(
            "error" in result && typeof result.error === "string"
              ? result.error
              : "Connection failed",
          );
          return;
        }
        setLocalConnected(false);
        setLocalError(`HTTP ${res.status}`);
      } catch (err) {
        setLocalConnected(false);
        setLocalError(err instanceof Error ? err.message : "Connection failed");
      } finally {
        setLocalTesting(false);
      }
    },
    [loadData],
  );

  // -------------------------------------------------------------------------
  // Custom OpenAI-compatible STT endpoint test
  // -------------------------------------------------------------------------

  const clearSttStatus = useCallback(() => {
    setSttConnected(null);
    setSttError(null);
  }, []);

  const testOpenaiStt = useCallback(
    async (values: { url: string; apiKey: string }) => {
      setSttTesting(true);
      setSttConnected(null);
      setSttError(null);
      try {
        const url = values.url.replace(/\/+$/, "");
        const key = values.apiKey.trim();
        const client = getClient();
        await Promise.all([
          url
            ? client.api.settings[":key"].$put({
                param: { key: SETTINGS_KEYS.openaiSttBaseUrl },
                json: { value: url },
              })
            : client.api.settings[":key"].$delete({
                param: { key: SETTINGS_KEYS.openaiSttBaseUrl },
              }),
          key
            ? client.api.settings[":key"].$put({
                param: { key: SETTINGS_KEYS.openaiSttApiKey },
                json: { value: key },
              })
            : client.api.settings[":key"].$delete({
                param: { key: SETTINGS_KEYS.openaiSttApiKey },
              }),
        ]);

        if (!url) {
          setSttConnected(null);
          await loadData();
          return;
        }

        const res = await client.api.settings["openai-stt"].test.$post({
          json: { url, api_key: key || undefined },
        });

        if (res.ok) {
          const result = await res.json();
          if ("ok" in result && result.ok) {
            setSttConnected(true);
            setSttModels(result.models ?? []);
            await loadData();
            return;
          }
          setSttConnected(false);
          setSttError(
            "error" in result && typeof result.error === "string"
              ? result.error
              : "Connection failed",
          );
          return;
        }
        setSttConnected(false);
        setSttError(`HTTP ${res.status}`);
      } catch (err) {
        setSttConnected(false);
        setSttError(err instanceof Error ? err.message : "Connection failed");
      } finally {
        setSttTesting(false);
      }
    },
    [loadData],
  );

  return {
    loading,
    available,
    configured,
    apiKeys,
    whisperStatus,
    mlxStatus,
    llmCleanup,
    settingsSeeded,
    mlxKeepAliveMinutes,
    deletingKeys,
    deletingProviders,
    keyProviders,
    defaultVoice,
    defaultLlm,
    voiceItems,
    llmModelsByProvider,
    localLlm: {
      initialUrl: localInitialUrl,
      initialApiKey: localInitialApiKey,
      testing: localTesting,
      connected: localConnected,
      error: localError,
      models: localModels,
      test: testLocalLlm,
      clearStatus: clearLocalStatus,
    },
    openaiStt: {
      initialUrl: sttInitialUrl,
      initialApiKey: sttInitialApiKey,
      testing: sttTesting,
      connected: sttConnected,
      error: sttError,
      models: sttModels,
      test: testOpenaiStt,
      clearStatus: clearSttStatus,
    },
    configureModel,
    saveKey,
    selectLocalVoice,
    retryLocalMlx,
    downloadLocal,
    cancelLocal,
    deleteLocal,
    selectLocalLlmModel,
    setCleanup,
    saveMlxKeepAliveMinutes,
    deleteProvider,
    reload: loadData,
  };
}
