import {
  type ApiKeyInput,
  apiKeySchema,
  type LocalLlmConfigInput,
  localLlmConfigSchema,
} from "@freestyle/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { getClient } from "@renderer/lib/api";
import type {
  AvailableModel,
  MlxAsrStatus,
  WhisperStatus,
} from "@renderer/lib/models";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { DEFAULT_MLX_KEEP_ALIVE_MINUTES, IS_MAC } from "./constants";
import {
  ApiKeyDialog,
  DeleteDialog,
  EditKeyDialog,
  LocalModelDeleteDialog,
} from "./dialogs";
import { LlmPicker } from "./llm-picker";
import { MlxMemorySection } from "./mlx-memory-section";
import { PageHeader, PageShell } from "./page-chrome";
import { PairCard } from "./pair-card";
import { ProvidersSection } from "./providers-section";
import type { ApiKeyEntry, ConfiguredModel, PickerType } from "./types";
import {
  buildSettingsVoiceItems,
  clampMlxKeepAliveMinutes,
  groupByProvider,
} from "./utils";
import { VoicePicker } from "./voice-picker";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ModelsPage(): React.JSX.Element {
  const [available, setAvailable] = useState<AvailableModel[]>([]);
  const [configured, setConfigured] = useState<ConfiguredModel[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [llmCleanup, setLlmCleanup] = useState(false);

  // Which inline picker is open ("voice" | "llm" | null)
  const [pickerOpen, setPickerOpen] = useState<PickerType>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  // Inline API-key prompt (when selecting a model whose provider has no key)
  const [pendingKeyProvider, setPendingKeyProvider] = useState<string | null>(
    null,
  );
  const [showPendingKey, setShowPendingKey] = useState(false);
  const [pendingModel, setPendingModel] = useState<AvailableModel | null>(null);
  const [pendingModelType, setPendingModelType] = useState<"voice" | "llm">(
    "voice",
  );

  // Provider key editing
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editKeyValue, setEditKeyValue] = useState("");
  const [showEditKey, setShowEditKey] = useState(false);

  // Key validation state
  const [keyValidating, setKeyValidating] = useState(false);
  const [keyValidationError, setKeyValidationError] = useState<string | null>(
    null,
  );

  // Delete confirmation
  const [deleteProvider, setDeleteProvider] = useState<string | null>(null);
  const [deleteBlockedBy, setDeleteBlockedBy] = useState<string[]>([]);
  const [pendingLocalDelete, setPendingLocalDelete] = useState<{
    modelId: string;
    engine: "whisper" | "mlx";
    name: string;
  } | null>(null);

  // Local Whisper
  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus | null>(
    null,
  );
  const [mlxStatus, setMlxStatus] = useState<MlxAsrStatus | null>(null);
  const [mlxKeepAliveMinutes, setMlxKeepAliveMinutes] = useState(
    DEFAULT_MLX_KEEP_ALIVE_MINUTES,
  );

  // Local LLM
  const localLlmForm = useForm<LocalLlmConfigInput>({
    resolver: zodResolver(localLlmConfigSchema),
    defaultValues: { url: "http://localhost:11434", api_key: "" },
  });
  const [showLocalLlmApiKey, setShowLocalLlmApiKey] = useState(false);
  const [localLlmTesting, setLocalLlmTesting] = useState(false);
  const [localLlmConnected, setLocalLlmConnected] = useState<boolean | null>(
    null,
  );
  const [localLlmError, setLocalLlmError] = useState<string | null>(null);
  const [localLlmModels, setLocalLlmModels] = useState<string[]>([]);

  const pairCardRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // API Key dialog form
  const apiKeyForm = useForm<ApiKeyInput>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { provider: "", key: "" },
  });

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    try {
      const client = getClient();
      const [
        availRes,
        configRes,
        keysRes,
        cleanupRes,
        localUrlRes,
        localKeyRes,
        mlxKeepAliveRes,
      ] = await Promise.all([
        client.api.models.available.$get(),
        client.api.models.configured.$get(),
        client.api.keys.$get(),
        client.api.settings[":key"].$get({ param: { key: "llm_cleanup" } }),
        client.api.settings[":key"].$get({ param: { key: "local_llm_url" } }),
        client.api.settings[":key"].$get({
          param: { key: "local_llm_api_key" },
        }),
        client.api.settings[":key"].$get({
          param: { key: "mlx_asr_keep_alive_minutes" },
        }),
      ]);
      if (availRes.ok) setAvailable(await availRes.json());
      if (configRes.ok) {
        const configs: ConfiguredModel[] = await configRes.json();
        setConfigured(configs);
      }
      if (keysRes.ok) setApiKeys((await keysRes.json()) as ApiKeyEntry[]);
      if (cleanupRes.ok) {
        const data = await cleanupRes.json();
        if (data?.value) setLlmCleanup(data.value === "true");
      }
      if (localUrlRes.ok) {
        const data = await localUrlRes.json();
        if (data?.value) localLlmForm.setValue("url", data.value);
      }
      if (localKeyRes.ok) {
        const data = await localKeyRes.json();
        if (data?.value) localLlmForm.setValue("api_key", data.value);
      }
      if (mlxKeepAliveRes.ok) {
        const data = await mlxKeepAliveRes.json();
        const minutes = Number(data?.value);
        if (Number.isFinite(minutes)) {
          setMlxKeepAliveMinutes(clampMlxKeepAliveMinutes(minutes));
        }
      }
    } catch (err) {
      console.error("Failed to load models data:", err);
    } finally {
      setLoading(false);
    }
  }, [localLlmForm.setValue]);

  const loadWhisperStatus = useCallback(async () => {
    try {
      const res = await getClient().api.whisper.status.$get();
      if (res.ok) {
        const data: WhisperStatus = await res.json();
        setWhisperStatus(data);
        return data;
      }
    } catch (err) {
      console.error("Failed to load whisper status:", err);
    }
    return null;
  }, []);

  const loadMlxStatus = useCallback(async (refresh = false) => {
    try {
      const res = refresh
        ? await getClient().api["mlx-asr"].status.$get({
            query: { refresh: "1" },
          })
        : await getClient().api["mlx-asr"].status.$get();
      if (res.ok) {
        const data: MlxAsrStatus = await res.json();
        setMlxStatus(data);
        if (Number.isFinite(data.keepAliveMinutes)) {
          setMlxKeepAliveMinutes(
            clampMlxKeepAliveMinutes(data.keepAliveMinutes),
          );
        }
        return data;
      }
    } catch (err) {
      console.error("Failed to load MLX ASR status:", err);
    }
    return null;
  }, []);

  useEffect(() => {
    loadData();
    loadWhisperStatus();
    if (IS_MAC) loadMlxStatus();
  }, [loadData, loadWhisperStatus, loadMlxStatus]);

  // Poll whisper status while a download is active
  useEffect(() => {
    const hasActiveDownload =
      whisperStatus?.binaryDownloading ||
      whisperStatus?.models.some(
        (m) => m.status === "downloading" || m.status === "verifying",
      );
    if (!hasActiveDownload) return;
    const interval = setInterval(() => {
      loadWhisperStatus().then((data) => {
        if (
          data &&
          !data.binaryDownloading &&
          !data.models.some(
            (m) => m.status === "downloading" || m.status === "verifying",
          )
        ) {
          loadData();
        }
      });
    }, 500);
    return () => clearInterval(interval);
  }, [whisperStatus, loadWhisperStatus, loadData]);

  useEffect(() => {
    const hasActiveDownload = mlxStatus?.models?.some(
      (m) => m.status === "downloading" || m.status === "verifying",
    );
    if (!hasActiveDownload) return;
    const interval = setInterval(() => {
      loadMlxStatus().then((data) => {
        if (
          data &&
          !data.models?.some(
            (m) => m.status === "downloading" || m.status === "verifying",
          )
        ) {
          loadData();
        }
      });
    }, 500);
    return () => clearInterval(interval);
  }, [mlxStatus, loadMlxStatus, loadData]);

  // Close the inline picker when mousedown lands outside both the pair card
  // (which holds the Change triggers) and the picker itself. Wrapping refs on
  // each let onClick still toggle the picker via the trigger button.
  useEffect(() => {
    if (!pickerOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (pairCardRef.current?.contains(target)) return;
      if (pickerRef.current?.contains(target)) return;
      setPickerOpen(null);
      setPickerSearch("");
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [pickerOpen]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const keyProviders = new Set(apiKeys.map((k) => k.provider));

  const defaultVoice = configured.find(
    (m) => m.type === "voice" && m.is_default === 1,
  );
  const defaultLlm = configured.find(
    (m) => m.type === "llm" && m.is_default === 1,
  );

  const llmModelsByProvider = groupByProvider(available, "llm");

  // Unified voice list: on-device (whisper.cpp) first, then cloud — one list.
  const voiceItems = buildSettingsVoiceItems(
    available,
    whisperStatus,
    mlxStatus,
    {
      defaultVoice,
      keyProviders,
    },
  );

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const closePicker = useCallback(() => {
    setPickerOpen(null);
    setPickerSearch("");
  }, []);

  const closePendingKey = useCallback(() => {
    setPendingKeyProvider(null);
    setPendingModel(null);
    setShowPendingKey(false);
    setKeyValidationError(null);
    apiKeyForm.reset({ provider: "", key: "" });
  }, [apiKeyForm]);

  const openPicker = useCallback(
    (type: "voice" | "llm") => {
      setPickerOpen((prev) => (prev === type ? null : type));
      setPickerSearch("");
      closePendingKey();
    },
    [closePendingKey],
  );

  const selectModel = useCallback(
    async (model: AvailableModel, type: "voice" | "llm") => {
      if (
        model.provider_id !== "local-llm" &&
        model.provider_id !== "local-whisper" &&
        !keyProviders.has(model.provider_id)
      ) {
        setPendingModel(model);
        setPendingKeyProvider(model.provider_id);
        apiKeyForm.reset({ provider: model.provider_id, key: "" });
        setShowPendingKey(false);
        setPendingModelType(type);
        closePicker();
        return;
      }

      await getClient().api.models.configured.$post({
        json: {
          provider: model.provider_id,
          model_id: model.model_id,
          model_name: model.model_name,
          type,
          is_default: true,
        },
      });
      closePicker();
      loadData();
    },
    [keyProviders, loadData, apiKeyForm.reset, closePicker],
  );

  const savePendingKeyAndModel = useCallback(
    async (data: ApiKeyInput) => {
      if (!pendingModel) return;

      setKeyValidating(true);
      setKeyValidationError(null);

      try {
        const client = getClient();

        // Validate first — no key is saved yet
        const valRes = await client.api.keys.validate.$post({
          json: { provider: data.provider, key: data.key },
        });

        if (valRes.ok) {
          const valBody = await valRes.json();
          if ("valid" in valBody && valBody.valid === false) {
            setKeyValidationError(
              ("error" in valBody && typeof valBody.error === "string"
                ? valBody.error
                : null) ?? "API key is not valid.",
            );
            setKeyValidating(false);
            return;
          }
        }

        // Key is valid — save it and configure the model
        await client.api.keys.$post({
          json: { provider: data.provider, key: data.key },
        });

        await client.api.models.configured.$post({
          json: {
            provider: pendingModel.provider_id,
            model_id: pendingModel.model_id,
            model_name: pendingModel.model_name,
            type: pendingModelType,
            is_default: true,
          },
        });

        closePendingKey();
        closePicker();
        loadData();
      } catch {
        setKeyValidationError("Failed to validate key. Please try again.");
      } finally {
        setKeyValidating(false);
      }
    },
    [pendingModel, pendingModelType, closePendingKey, closePicker, loadData],
  );

  const setCleanupOn = useCallback((next: boolean) => {
    setLlmCleanup(next);
    getClient()
      .api.settings[":key"].$put({
        param: { key: "llm_cleanup" },
        json: { value: String(next) },
      })
      .catch((err) => console.error("Failed to save LLM cleanup:", err));
  }, []);

  const saveMlxKeepAliveMinutes = useCallback((minutes: number) => {
    const next = clampMlxKeepAliveMinutes(minutes);
    setMlxKeepAliveMinutes(next);
    getClient()
      .api.settings[":key"].$put({
        param: { key: "mlx_asr_keep_alive_minutes" },
        json: { value: String(next) },
      })
      .then(() => {
        if (next !== 0) return;
        return getClient().api["mlx-asr"].server.stop.$post();
      })
      .catch((err) => console.error("Failed to save MLX ASR keep-alive:", err));
  }, []);

  const saveProviderKey = useCallback(async () => {
    if (!editKeyValue.trim() || !editingProvider) return;

    setKeyValidating(true);
    setKeyValidationError(null);

    try {
      const client = getClient();

      // Validate first
      const valRes = await client.api.keys.validate.$post({
        json: { provider: editingProvider, key: editKeyValue.trim() },
      });

      if (valRes.ok) {
        const valBody = await valRes.json();
        if ("valid" in valBody && valBody.valid === false) {
          setKeyValidationError(
            ("error" in valBody && typeof valBody.error === "string"
              ? valBody.error
              : null) ?? "API key is not valid.",
          );
          setKeyValidating(false);
          return;
        }
      }

      // Key is valid — save it
      await client.api.keys.$post({
        json: { provider: editingProvider, key: editKeyValue.trim() },
      });

      setEditingProvider(null);
      setEditKeyValue("");
      setShowEditKey(false);
      loadData();
    } catch {
      setKeyValidationError("Failed to validate key. Please try again.");
    } finally {
      setKeyValidating(false);
    }
  }, [editKeyValue, editingProvider, loadData]);

  const startEditProvider = useCallback((provider: string) => {
    setEditingProvider(provider);
    setEditKeyValue("");
    setShowEditKey(false);
    setKeyValidationError(null);
  }, []);

  const closeEditProvider = useCallback(() => {
    setEditingProvider(null);
    setEditKeyValue("");
    setShowEditKey(false);
    setKeyValidationError(null);
  }, []);

  const tryDeleteProvider = useCallback(
    (provider: string) => {
      const activeModels: string[] = [];
      if (defaultVoice?.provider === provider)
        activeModels.push(`Voice: ${defaultVoice.model_name}`);
      if (defaultLlm?.provider === provider)
        activeModels.push(`LLM: ${defaultLlm.model_name}`);
      setDeleteProvider(provider);
      setDeleteBlockedBy(activeModels);
    },
    [defaultVoice, defaultLlm],
  );

  const confirmDeleteProvider = useCallback(async () => {
    if (!deleteProvider) return;
    const client = getClient();
    await client.api.keys[":provider"].$delete({
      param: { provider: deleteProvider },
    });
    const providerModels = configured.filter(
      (m) => m.provider === deleteProvider,
    );
    await Promise.all(
      providerModels.map((m) =>
        client.api.models.configured[":id"].$delete({
          param: { id: String(m.id) },
        }),
      ),
    );
    setDeleteProvider(null);
    setDeleteBlockedBy([]);
    loadData();
  }, [deleteProvider, configured, loadData]);

  // --- Local Whisper actions (download in place, inside the picker) ---------

  const downloadWhisper = useCallback(
    async (modelId: string) => {
      await getClient().api.whisper.models[":model"].download.$post({
        param: { model: modelId },
      });
      loadWhisperStatus();
    },
    [loadWhisperStatus],
  );

  const cancelWhisper = useCallback(
    async (modelId: string) => {
      await getClient().api.whisper.models[":model"].cancel.$post({
        param: { model: modelId },
      });
      loadWhisperStatus();
    },
    [loadWhisperStatus],
  );

  const deleteWhisper = useCallback(
    async (modelId: string) => {
      await getClient().api.whisper.models[":model"].$delete({
        param: { model: modelId },
      });
      loadWhisperStatus();
      loadData();
    },
    [loadWhisperStatus, loadData],
  );

  const downloadMlx = useCallback(
    async (modelId: string) => {
      await getClient().api["mlx-asr"].models[":model"].download.$post({
        param: { model: modelId },
      });
      loadMlxStatus();
    },
    [loadMlxStatus],
  );

  const cancelMlx = useCallback(
    async (modelId: string) => {
      await getClient().api["mlx-asr"].models[":model"].cancel.$post({
        param: { model: modelId },
      });
      loadMlxStatus();
    },
    [loadMlxStatus],
  );

  const deleteMlx = useCallback(
    async (modelId: string) => {
      await getClient().api["mlx-asr"].models[":model"].$delete({
        param: { model: modelId },
      });
      loadMlxStatus();
      loadData();
    },
    [loadMlxStatus, loadData],
  );

  const downloadLocalVoice = useCallback(
    (modelId: string, engine?: "whisper" | "mlx") => {
      if (engine === "mlx") {
        void downloadMlx(modelId);
        return;
      }
      void downloadWhisper(modelId);
    },
    [downloadMlx, downloadWhisper],
  );

  const cancelLocalVoice = useCallback(
    (modelId: string, engine?: "whisper" | "mlx") => {
      if (engine === "mlx") {
        void cancelMlx(modelId);
        return;
      }
      void cancelWhisper(modelId);
    },
    [cancelMlx, cancelWhisper],
  );

  const requestDeleteLocalVoice = useCallback(
    (modelId: string, engine?: "whisper" | "mlx") => {
      if (!engine) return;
      const item = voiceItems.find(
        (row) => row.defId === modelId && row.localEngine === engine,
      );
      setPendingLocalDelete({
        modelId,
        engine,
        name: item?.name ?? modelId,
      });
    },
    [voiceItems],
  );

  const confirmDeleteLocalVoice = useCallback(async () => {
    if (!pendingLocalDelete) return;
    const { modelId, engine } = pendingLocalDelete;
    setPendingLocalDelete(null);
    if (engine === "mlx") {
      await deleteMlx(modelId);
      return;
    }
    await deleteWhisper(modelId);
  }, [pendingLocalDelete, deleteMlx, deleteWhisper]);

  const selectLocalVoice = useCallback(
    async (modelId: string, modelName: string) => {
      await getClient().api.models.configured.$post({
        json: {
          provider: "local-whisper",
          model_id: `local-whisper/${modelId}`,
          model_name: modelName,
          type: "voice",
          is_default: true,
        },
      });
      getClient()
        .api.whisper.server.start.$post({ json: { modelId } })
        .catch(() => {});
      closePicker();
      loadData();
    },
    [closePicker, loadData],
  );

  const selectLocalMlx = useCallback(
    async (modelId: string, modelName: string) => {
      await getClient().api.models.configured.$post({
        json: {
          provider: "local-mlx",
          model_id: `local-mlx/${modelId}`,
          model_name: modelName,
          type: "voice",
          is_default: true,
        },
      });
      getClient()
        .api["mlx-asr"].server.start.$post({ json: { modelId } })
        .catch(() => {});
      closePicker();
      loadData();
    },
    [closePicker, loadData],
  );

  const retryLocalMlx = useCallback(
    async (modelId: string) => {
      const data = await loadMlxStatus(true);
      if (!data?.canRun) return;
      const status = data.models?.find((m) => m.model === modelId);
      if (status?.status !== "ready") {
        await downloadMlx(modelId);
        return;
      }
      const name =
        data.modelDefinitions.find((m) => m.id === modelId)?.displayName ??
        modelId;
      await selectLocalMlx(modelId, name);
    },
    [downloadMlx, loadMlxStatus, selectLocalMlx],
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
      closePicker();
      loadData();
    },
    [closePicker, loadData],
  );

  const testLocalLlm = localLlmForm.handleSubmit(async (data) => {
    setLocalLlmTesting(true);
    setLocalLlmConnected(null);
    setLocalLlmError(null);

    try {
      const url = data.url.replace(/\/+$/, "");
      const client = getClient();

      await Promise.all([
        client.api.settings[":key"].$put({
          param: { key: "local_llm_url" },
          json: { value: url },
        }),
        data.api_key?.trim()
          ? client.api.settings[":key"].$put({
              param: { key: "local_llm_api_key" },
              json: { value: data.api_key.trim() },
            })
          : client.api.settings[":key"].$delete({
              param: { key: "local_llm_api_key" },
            }),
      ]);

      const res = await client.api.settings["local-llm"].test.$post({
        json: { url, api_key: data.api_key?.trim() || undefined },
      });

      if (res.ok) {
        const result = await res.json();
        if ("ok" in result && result.ok) {
          setLocalLlmConnected(true);
          setLocalLlmModels(result.models ?? []);
          loadData();
        } else {
          setLocalLlmConnected(false);
          const errorMsg =
            "error" in result && typeof result.error === "string"
              ? result.error
              : "Connection failed";
          setLocalLlmError(errorMsg);
        }
      } else {
        setLocalLlmConnected(false);
        setLocalLlmError(`HTTP ${res.status}`);
      }
    } catch (err) {
      setLocalLlmConnected(false);
      setLocalLlmError(
        err instanceof Error ? err.message : "Connection failed",
      );
    } finally {
      setLocalLlmTesting(false);
    }
  });

  // -------------------------------------------------------------------------
  // Render — early returns
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-24">
          <p className="text-muted-foreground text-sm">Loading models…</p>
        </div>
      </PageShell>
    );
  }

  const isLocalWhisperActive = defaultVoice?.provider === "local-whisper";
  const isLocalMlxActive = defaultVoice?.provider === "local-mlx";
  const hasDownloadedMlx =
    mlxStatus?.models?.some((m) => m.status === "ready") ?? false;
  const hasLocalModel =
    isLocalWhisperActive ||
    isLocalMlxActive ||
    !!whisperStatus?.models.some((m) => m.status === "ready") ||
    hasDownloadedMlx;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <PageShell>
      <PageHeader title="Models" />
      <div className="space-y-4">
        <div ref={pairCardRef}>
          <PairCard
            voice={defaultVoice}
            llm={defaultLlm}
            llmCleanup={llmCleanup}
            onToggleCleanup={setCleanupOn}
            onChangeVoice={() => openPicker("voice")}
            onChangeLlm={() => {
              setCleanupOn(true);
              openPicker("llm");
            }}
            pickerOpen={pickerOpen}
          />
        </div>

        {(isLocalMlxActive ||
          (mlxStatus?.platformSupported &&
            mlxStatus.models.some((m) => m.status === "ready"))) && (
          <MlxMemorySection
            keepAliveMinutes={mlxKeepAliveMinutes}
            serverRunning={!!mlxStatus?.serverRunning}
            blockedReason={mlxStatus?.blockedReason ?? null}
            onChange={saveMlxKeepAliveMinutes}
          />
        )}

        {/* Inline picker — appears below the pair card */}
        {pickerOpen === "voice" && (
          <div ref={pickerRef}>
            <VoicePicker
              items={voiceItems}
              binaryDownloading={!!whisperStatus?.binaryDownloading}
              onSelectCloud={(m) => selectModel(m, "voice")}
              onSelectLocal={(defId, name, engine) => {
                if (engine === "mlx") selectLocalMlx(defId, name);
                else selectLocalVoice(defId, name);
              }}
              onRetryLocal={(defId, engine) => {
                if (engine === "mlx") retryLocalMlx(defId);
                else downloadWhisper(defId);
              }}
              onDownload={downloadLocalVoice}
              onCancel={cancelLocalVoice}
              onDelete={requestDeleteLocalVoice}
              onClose={closePicker}
            />
          </div>
        )}

        {pickerOpen === "llm" && (
          <div ref={pickerRef}>
            <LlmPicker
              modelsByProvider={llmModelsByProvider}
              currentDefault={defaultLlm}
              search={pickerSearch}
              setSearch={setPickerSearch}
              keyProviders={keyProviders}
              onSelectCloud={(m) => selectModel(m, "llm")}
              onClose={closePicker}
              localForm={localLlmForm}
              showLocalApiKey={showLocalLlmApiKey}
              setShowLocalApiKey={setShowLocalLlmApiKey}
              localTesting={localLlmTesting}
              localConnected={localLlmConnected}
              localError={localLlmError}
              localModels={localLlmModels}
              onTestLocal={testLocalLlm}
              onClearLocalStatus={() => {
                setLocalLlmConnected(null);
                setLocalLlmError(null);
              }}
              onSelectLocalModel={selectLocalLlmModel}
            />
          </div>
        )}

        {/* Providers section */}
        <ProvidersSection
          apiKeys={apiKeys}
          configured={configured}
          showLocalProvider={hasLocalModel}
          onAdd={() => openPicker("voice")}
          onEdit={startEditProvider}
          onDelete={tryDeleteProvider}
        />

        {/* Modals */}
        {pendingKeyProvider && pendingModel && (
          <ApiKeyDialog
            model={pendingModel}
            provider={pendingKeyProvider}
            form={apiKeyForm}
            show={showPendingKey}
            setShow={setShowPendingKey}
            onClose={closePendingKey}
            onSubmit={savePendingKeyAndModel}
            validating={keyValidating}
            validationError={keyValidationError}
          />
        )}

        {editingProvider && (
          <EditKeyDialog
            provider={editingProvider}
            value={editKeyValue}
            setValue={setEditKeyValue}
            show={showEditKey}
            setShow={setShowEditKey}
            onClose={closeEditProvider}
            onSave={saveProviderKey}
            validating={keyValidating}
            validationError={keyValidationError}
          />
        )}

        {deleteProvider && (
          <DeleteDialog
            provider={deleteProvider}
            blockedBy={deleteBlockedBy}
            onCancel={() => {
              setDeleteProvider(null);
              setDeleteBlockedBy([]);
            }}
            onConfirm={confirmDeleteProvider}
          />
        )}

        {pendingLocalDelete && (
          <LocalModelDeleteDialog
            name={pendingLocalDelete.name}
            engine={pendingLocalDelete.engine}
            onClose={() => setPendingLocalDelete(null)}
            onConfirm={() => void confirmDeleteLocalVoice()}
          />
        )}
      </div>
    </PageShell>
  );
}
