import {
  type ApiKeyInput,
  apiKeySchema,
  type LocalLlmConfigInput,
  localLlmConfigSchema,
} from "@freestyle/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { Toggle, VoiceRow } from "@renderer/components/voice-row";
import { getApiBase, getClient } from "@renderer/lib/api";
import {
  type AvailableModel,
  buildVoiceItems,
  displayProviderName,
  LLM_PROVIDERS,
  VOICE_PROVIDERS,
  type VoiceItem,
  type WhisperStatus,
} from "@renderer/lib/models";
import { cn } from "@renderer/lib/utils";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleDollarSign,
  Cloud,
  Cpu,
  Eye,
  EyeOff,
  Key,
  Laptop,
  Loader2,
  Mic,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfiguredModel {
  id: number;
  provider: string;
  model_id: string;
  model_name: string;
  type: string;
  is_default: number;
}

interface ApiKeyEntry {
  provider: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Editorial empty-state suggestions — surfaced when no providers exist. */
const RECOMMENDED_PROVIDERS = [
  {
    id: "groq",
    name: "Groq · whisper-v3-turbo",
    desc: "Fastest · ~$0.04/hr",
    recommended: true,
  },
  {
    id: "openai",
    name: "OpenAI · gpt-4o-mini",
    desc: "Most accurate · ~$0.18/hr",
  },
  {
    id: "deepgram",
    name: "Deepgram · nova-3",
    desc: "Streaming · ~$0.26/hr",
  },
];

function displayName(providerId: string, fallback?: string): string {
  return displayProviderName(providerId, fallback);
}

type PickerType = "voice" | "llm" | null;

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

  // Delete confirmation
  const [deleteProvider, setDeleteProvider] = useState<string | null>(null);
  const [deleteBlockedBy, setDeleteBlockedBy] = useState<string[]>([]);

  // Local Whisper
  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus | null>(
    null,
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
      ] = await Promise.all([
        client.api.models.available.$get(),
        client.api.models.configured.$get(),
        client.api.keys.$get(),
        client.api.settings[":key"].$get({ param: { key: "llm_cleanup" } }),
        client.api.settings[":key"].$get({ param: { key: "local_llm_url" } }),
        client.api.settings[":key"].$get({
          param: { key: "local_llm_api_key" },
        }),
      ]);
      if (availRes.ok) setAvailable(await availRes.json());
      if (configRes.ok) {
        const configs: ConfiguredModel[] = await configRes.json();
        setConfigured(configs);
      }
      if (keysRes.ok) setApiKeys(await keysRes.json());
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
    } catch (err) {
      console.error("Failed to load models data:", err);
    } finally {
      setLoading(false);
    }
  }, [localLlmForm.setValue]);

  const loadWhisperStatus = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/whisper/status`);
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

  useEffect(() => {
    loadData();
    loadWhisperStatus();
  }, [loadData, loadWhisperStatus]);

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

  function groupByProvider(
    list: AvailableModel[],
    type: "voice" | "llm",
  ): Map<string, { providerName: string; models: AvailableModel[] }> {
    const map = new Map<
      string,
      { providerName: string; models: AvailableModel[] }
    >();
    const allowed = type === "voice" ? VOICE_PROVIDERS : LLM_PROVIDERS;
    for (const m of list) {
      if (m.type !== type) continue;
      if (!allowed.includes(m.provider_id)) continue;
      // Local LLM and Local Whisper have their own dedicated sections
      if (type === "llm" && m.provider_id === "local-llm") continue;
      if (type === "voice" && m.provider_id === "local-whisper") continue;
      let entry = map.get(m.provider_id);
      if (!entry) {
        entry = {
          providerName: displayName(m.provider_id, m.provider_name),
          models: [],
        };
        map.set(m.provider_id, entry);
      }
      entry.models.push(m);
    }
    return map;
  }

  // Unified voice list: on-device (whisper.cpp) first, then cloud — one list.
  const voiceItems = buildSettingsVoiceItems(available, whisperStatus, {
    defaultVoice,
    keyProviders,
  });

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

      const client = getClient();
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

  const saveProviderKey = useCallback(async () => {
    if (!editKeyValue.trim() || !editingProvider) return;
    await getClient().api.keys.$post({
      json: { provider: editingProvider, key: editKeyValue.trim() },
    });
    setEditingProvider(null);
    setEditKeyValue("");
    setShowEditKey(false);
    loadData();
  }, [editKeyValue, editingProvider, loadData]);

  const startEditProvider = useCallback((provider: string) => {
    setEditingProvider(provider);
    setEditKeyValue("");
    setShowEditKey(false);
  }, []);

  const closeEditProvider = useCallback(() => {
    setEditingProvider(null);
    setEditKeyValue("");
    setShowEditKey(false);
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
      await fetch(`${getApiBase()}/api/whisper/models/${modelId}/download`, {
        method: "POST",
      });
      loadWhisperStatus();
    },
    [loadWhisperStatus],
  );

  const cancelWhisper = useCallback(
    async (modelId: string) => {
      await fetch(`${getApiBase()}/api/whisper/models/${modelId}/cancel`, {
        method: "POST",
      });
      loadWhisperStatus();
    },
    [loadWhisperStatus],
  );

  const deleteWhisper = useCallback(
    async (modelId: string) => {
      await fetch(`${getApiBase()}/api/whisper/models/${modelId}`, {
        method: "DELETE",
      });
      loadWhisperStatus();
      loadData();
    },
    [loadWhisperStatus, loadData],
  );

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
      fetch(`${getApiBase()}/api/whisper/server/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      }).catch(() => {});
      closePicker();
      loadData();
    },
    [closePicker, loadData],
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
  const hasLocalModel =
    isLocalWhisperActive ||
    !!whisperStatus?.models.some((m) => m.status === "ready");

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <PageShell>
      <PageHeader
        title="Models"
        subtitle="Choose how Freestyle listens — on-device for privacy, or cloud for speed and reach. Add an optional model to clean up what you say."
        offline={isLocalWhisperActive}
      />
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

        {/* Inline picker — appears below the pair card */}
        {pickerOpen === "voice" && (
          <div ref={pickerRef}>
            <VoicePicker
              items={voiceItems}
              binaryDownloading={!!whisperStatus?.binaryDownloading}
              onSelectCloud={(m) => selectModel(m, "voice")}
              onSelectLocal={selectLocalVoice}
              onDownload={downloadWhisper}
              onCancel={cancelWhisper}
              onDelete={deleteWhisper}
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
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// buildVoiceItems — thin wrapper around shared helper to pass settings-page ctx
// ---------------------------------------------------------------------------

function buildSettingsVoiceItems(
  available: AvailableModel[],
  whisperStatus: WhisperStatus | null,
  ctx: {
    defaultVoice: ConfiguredModel | undefined;
    keyProviders: Set<string>;
  },
): VoiceItem[] {
  return buildVoiceItems(available, whisperStatus, {
    selectedModelId: ctx.defaultVoice?.model_id,
    selectedProvider: ctx.defaultVoice?.provider,
    keyProviders: ctx.keyProviders,
  });
}

// ---------------------------------------------------------------------------
// PageShell — draggable topbar + padded scroll area, matches history/dictionary/formats
// ---------------------------------------------------------------------------

function PageShell({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="h-9 shrink-0" />
      <div
        className="responsive-page-scroll flex-1 overflow-auto"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageHeader — editorial title with italic accent + offline-ready badge
// ---------------------------------------------------------------------------

function PageHeader({
  title,
  subtitle,
  offline,
}: {
  title: string;
  subtitle?: string;
  offline?: boolean;
}): React.JSX.Element {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div>
        <h1 className="serif text-foreground m-0 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
          <span className="serif-italic text-primary">{title}</span>
          <span>. </span>
        </h1>
        {subtitle && (
          <p className="text-muted-foreground mt-2.5 max-w-[480px] text-[14px] leading-[1.5]">
            {subtitle}
          </p>
        )}
      </div>
      {offline && (
        <div className="bg-accent flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5">
          <WifiOff className="text-accent-foreground h-3 w-3" />
          <span
            className="mono text-accent-foreground text-[10px] uppercase"
            style={{ letterSpacing: "0.1em" }}
          >
            Offline ready
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PairCard — the "current pair" hero: Voice (required) + LLM cleanup (optional)
// ---------------------------------------------------------------------------

function PairCard({
  voice,
  llm,
  llmCleanup,
  onToggleCleanup,
  onChangeVoice,
  onChangeLlm,
  pickerOpen,
}: {
  voice: ConfiguredModel | undefined;
  llm: ConfiguredModel | undefined;
  llmCleanup: boolean;
  onToggleCleanup: (next: boolean) => void;
  onChangeVoice: () => void;
  onChangeLlm: () => void;
  pickerOpen: PickerType;
}): React.JSX.Element {
  return (
    <section className="border-border bg-card grid grid-cols-1 gap-6 rounded-[14px] border p-6 min-[820px]:grid-cols-2">
      <PairSide
        kicker="Voice · required"
        modelName={voice?.model_name}
        providerName={voice ? displayName(voice.provider) : undefined}
        cta="Change"
        primary
        active={pickerOpen === "voice"}
        onChange={onChangeVoice}
      />
      <div className="border-border border-t pt-6 min-[820px]:border-l min-[820px]:border-t-0 min-[820px]:pl-6 min-[820px]:pt-0">
        <PairSide
          kicker="LLM cleanup · optional"
          modelName={llmCleanup ? llm?.model_name : undefined}
          providerName={
            llmCleanup && llm ? displayName(llm.provider) : undefined
          }
          cta={llm ? "Change" : "Pick a model"}
          toggle={llmCleanup}
          onToggle={onToggleCleanup}
          active={pickerOpen === "llm"}
          onChange={onChangeLlm}
          dimmed={!llmCleanup}
        />
      </div>
    </section>
  );
}

function PairSide({
  kicker,
  modelName,
  providerName,
  cta,
  primary,
  toggle,
  onToggle,
  active,
  onChange,
  dimmed,
}: {
  kicker: string;
  modelName: string | undefined;
  providerName: string | undefined;
  cta: string;
  primary?: boolean;
  toggle?: boolean;
  onToggle?: (next: boolean) => void;
  active?: boolean;
  onChange: () => void;
  dimmed?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-3 transition-opacity",
        dimmed && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between">
        <Eyebrow text={kicker} accent={primary} />
        {onToggle !== undefined && (
          <Toggle on={!!toggle} onChange={(v) => onToggle(v)} />
        )}
      </div>
      <div>
        {modelName ? (
          <div
            className="serif text-foreground"
            style={{
              fontSize: 34,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              fontWeight: 400,
            }}
          >
            {modelName}
          </div>
        ) : (
          <div
            className="serif-italic text-muted-foreground"
            style={{ fontSize: 30, lineHeight: 1.1 }}
          >
            None selected
          </div>
        )}
        {providerName && (
          <div className="text-muted-foreground mt-1.5 text-[13px]">
            via{" "}
            <span className="text-foreground/80 font-medium">
              {providerName}
            </span>
          </div>
        )}
      </div>
      <div className="mt-auto flex items-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={onChange}
          className={cn(
            "rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
            primary
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "border-border hover:bg-secondary border",
            active && "ring-primary/30 ring-2",
          )}
        >
          {cta}
        </button>
        {primary && modelName && (
          <span
            className="mono text-primary"
            style={{ fontSize: 10.5, letterSpacing: "0.14em" }}
          >
            READY
          </span>
        )}
      </div>
    </div>
  );
}

function Eyebrow({
  text,
  accent,
}: {
  text: string;
  accent?: boolean;
}): React.JSX.Element {
  return (
    <span
      className={cn(
        "mono text-[10px] uppercase",
        accent ? "text-primary" : "text-muted-foreground",
      )}
      style={{ letterSpacing: "0.14em" }}
    >
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Bytes / speed formatting (shared by the voice picker rows)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// VoicePicker — unified on-device + cloud list with filter chips & meters
// ---------------------------------------------------------------------------

const VOICE_FILTERS: {
  id: string;
  label: string;
  icon?: typeof Laptop;
}[] = [
  { id: "all", label: "All" },
  { id: "cloud", label: "Cloud", icon: Cloud },
  { id: "private", label: "On-device", icon: Laptop },
  { id: "fast", label: "Fastest", icon: Zap },
  { id: "accurate", label: "Most accurate", icon: Target },
  { id: "free", label: "No usage cost", icon: CircleDollarSign },
];

function applyVoiceFilter(items: VoiceItem[], filter: string): VoiceItem[] {
  if (filter === "private") return items.filter((m) => m.kind === "local");
  if (filter === "cloud") return items.filter((m) => m.kind === "cloud");
  if (filter === "free")
    return items.filter((m) => m.kind === "local" || m.cost === 0);
  if (filter === "fast")
    return items
      .filter((m) => (m.speed ?? 0) >= 4)
      .sort((a, b) => (b.speed ?? 0) - (a.speed ?? 0));
  if (filter === "accurate")
    return items
      .filter((m) => (m.quality ?? 0) >= 4)
      .sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));
  return items;
}

function VoicePicker({
  items,
  binaryDownloading,
  onSelectCloud,
  onSelectLocal,
  onDownload,
  onCancel,
  onDelete,
  onClose,
}: {
  items: VoiceItem[];
  binaryDownloading: boolean;
  onSelectCloud: (m: AvailableModel) => void;
  onSelectLocal: (defId: string, name: string) => void;
  onDownload: (defId: string) => void;
  onCancel: (defId: string) => void;
  onDelete: (defId: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [filter, setFilter] = useState("all");
  const list = applyVoiceFilter(items, filter);

  return (
    <section className="border-border bg-card overflow-hidden rounded-[14px] border shadow-[0_24px_50px_-34px_rgba(20,12,4,0.4)]">
      <header className="border-border flex items-center gap-2.5 border-b px-5 py-3.5">
        <Mic className="text-muted-foreground h-3.5 w-3.5" />
        <span
          className="mono text-foreground text-[11px] uppercase"
          style={{ letterSpacing: "0.14em" }}
        >
          Choose a voice model
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close picker"
        >
          <X size={16} />
        </button>
      </header>

      {/* filter chips */}
      <div className="border-border flex flex-wrap items-center gap-2 border-b px-5 py-3">
        {VOICE_FILTERS.map((f) => {
          const on = filter === f.id;
          const Icon = f.icon;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary/60",
              )}
            >
              {Icon && <Icon className="h-3 w-3" />}
              {f.label}
            </button>
          );
        })}
      </div>

      {binaryDownloading && (
        <div className="border-border flex items-center gap-2.5 border-b px-5 py-3">
          <Loader2 className="text-primary h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="text-muted-foreground text-[12px]">
            Building whisper.cpp from source — this may take a minute…
          </span>
        </div>
      )}

      <div className="max-h-[440px] overflow-y-auto">
        {list.length === 0 ? (
          <div className="text-muted-foreground px-5 py-10 text-center text-[13px]">
            No models match this filter.
          </div>
        ) : (
          list.map((item, i) => (
            <VoiceRow
              key={item.key}
              item={item}
              first={i === 0}
              onSelectCloud={onSelectCloud}
              onSelectLocal={onSelectLocal}
              onDownload={onDownload}
              onCancel={onCancel}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// LlmPicker — inline picker for LLM cleanup: on-device (local server) + cloud
// ---------------------------------------------------------------------------

function LlmPicker({
  modelsByProvider,
  currentDefault,
  search,
  setSearch,
  keyProviders,
  onSelectCloud,
  onClose,
  localForm,
  showLocalApiKey,
  setShowLocalApiKey,
  localTesting,
  localConnected,
  localError,
  localModels,
  onTestLocal,
  onClearLocalStatus,
  onSelectLocalModel,
}: {
  modelsByProvider: Map<
    string,
    { providerName: string; models: AvailableModel[] }
  >;
  currentDefault: ConfiguredModel | undefined;
  search: string;
  setSearch: (v: string) => void;
  keyProviders: Set<string>;
  onSelectCloud: (m: AvailableModel) => void;
  onClose: () => void;
  localForm: ReturnType<typeof useForm<LocalLlmConfigInput>>;
  showLocalApiKey: boolean;
  setShowLocalApiKey: (v: boolean) => void;
  localTesting: boolean;
  localConnected: boolean | null;
  localError: string | null;
  localModels: string[];
  onTestLocal: (e?: React.BaseSyntheticEvent) => Promise<void>;
  onClearLocalStatus: () => void;
  onSelectLocalModel: (modelName: string) => Promise<void>;
}): React.JSX.Element {
  const q = search.toLowerCase();

  // On-device rows: discovered models ∪ the current default (so a previously
  // chosen local model still shows as selected before the user re-tests).
  const localNames = new Set(localModels);
  if (currentDefault?.provider === "local-llm") {
    localNames.add(currentDefault.model_id.replace(/^local-llm\//, ""));
  }
  const localList = [...localNames].filter(
    (n) => !q || n.toLowerCase().includes(q),
  );

  return (
    <section className="border-border bg-card overflow-hidden rounded-[14px] border shadow-[0_24px_50px_-34px_rgba(20,12,4,0.4)]">
      <header className="border-border flex items-center gap-2.5 border-b px-5 py-3.5">
        <Sparkles className="text-muted-foreground h-3.5 w-3.5" />
        <span
          className="mono text-foreground text-[11px] uppercase"
          style={{ letterSpacing: "0.14em" }}
        >
          Pick an LLM model
        </span>
        <div className="border-border bg-background ml-3 flex flex-1 items-center gap-2 rounded-md border px-2.5 py-1">
          <Search className="text-muted-foreground h-3.5 w-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="placeholder:text-muted-foreground/70 flex-1 border-none bg-transparent text-[12.5px] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close picker"
        >
          <X size={16} />
        </button>
      </header>

      <div className="max-h-[440px] overflow-y-auto">
        {/* On-device group — connect a local server, then pick a model */}
        <div>
          <div className="border-border bg-card sticky top-0 z-10 flex items-center gap-2 border-b px-5 py-2">
            <Laptop className="text-primary h-3 w-3" />
            <span
              className="mono text-foreground text-[10px] uppercase"
              style={{ letterSpacing: "0.14em" }}
            >
              On-device
            </span>
            <span className="text-muted-foreground text-[11.5px]">
              Ollama, LM Studio & other OpenAI-compatible servers
            </span>
          </div>

          <form
            onSubmit={onTestLocal}
            className="border-border space-y-2.5 border-b px-5 py-3.5"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                {...localForm.register("url", { onChange: onClearLocalStatus })}
                placeholder="http://localhost:11434"
                className={cn(
                  "border-border bg-background flex-1 rounded-md border px-3 py-2 text-[13px]",
                  localForm.formState.errors.url && "border-destructive",
                )}
              />
              <button
                type="submit"
                disabled={localTesting}
                className="bg-secondary hover:bg-secondary/80 shrink-0 rounded-md px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-50"
              >
                {localTesting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Testing…
                  </span>
                ) : (
                  "Test"
                )}
              </button>
            </div>
            <div className="relative">
              <input
                type={showLocalApiKey ? "text" : "password"}
                {...localForm.register("api_key")}
                placeholder="API key (optional)"
                className="border-border bg-background w-full rounded-md border px-3 py-2 pr-10 text-[13px]"
              />
              <button
                type="button"
                onClick={() => setShowLocalApiKey(!showLocalApiKey)}
                className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
              >
                {showLocalApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {localConnected === true && (
              <p className="text-primary text-[12px]">
                Connected ({localModels.length}{" "}
                {localModels.length === 1 ? "model" : "models"})
              </p>
            )}
            {localConnected === false && (
              <p className="text-destructive text-[12px]">{localError}</p>
            )}
            {localForm.formState.errors.url && (
              <p className="text-destructive text-[12px]">
                {localForm.formState.errors.url.message}
              </p>
            )}
          </form>

          {localList.length === 0 ? (
            <div className="text-muted-foreground px-5 py-3 text-[12px]">
              No local models yet — test a connection to list them.
            </div>
          ) : (
            localList.map((name) => {
              const modelId = `local-llm/${name}`;
              const isActive =
                currentDefault?.provider === "local-llm" &&
                currentDefault?.model_id === modelId;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSelectLocalModel(name)}
                  className={cn(
                    "hover:bg-secondary/60 flex w-full items-center gap-2 px-5 py-2 text-left text-[13px]",
                    isActive && "bg-primary/5",
                  )}
                >
                  <span className="flex-1 truncate">{name}</span>
                  {isActive && <Check size={14} className="text-primary" />}
                </button>
              );
            })
          )}
        </div>

        {/* Cloud groups — one section per provider */}
        {[...modelsByProvider.entries()].map(
          ([providerId, { providerName, models }]) => {
            const filtered = q
              ? models.filter(
                  (m) =>
                    m.model_name.toLowerCase().includes(q) ||
                    m.model_id.toLowerCase().includes(q) ||
                    providerName.toLowerCase().includes(q),
                )
              : models;
            if (filtered.length === 0) return null;
            return (
              <div key={providerId}>
                <div className="border-border bg-card text-muted-foreground sticky top-0 z-10 border-b px-5 py-1.5 text-[10px] font-semibold uppercase tracking-wider">
                  {providerName}
                  {!keyProviders.has(providerId) && (
                    <span className="text-destructive ml-2 normal-case tracking-normal">
                      (no API key)
                    </span>
                  )}
                </div>
                {filtered.slice(0, 20).map((model) => {
                  const isActive =
                    currentDefault?.model_id === model.model_id &&
                    currentDefault?.provider === model.provider_id;
                  return (
                    <button
                      key={model.model_id}
                      type="button"
                      onClick={() => onSelectCloud(model)}
                      className={cn(
                        "hover:bg-secondary/60 flex w-full items-center gap-2 px-5 py-2 text-left text-[13px]",
                        isActive && "bg-primary/5",
                      )}
                    >
                      <span className="flex-1">{model.model_name}</span>
                      {isActive && <Check size={14} className="text-primary" />}
                    </button>
                  );
                })}
              </div>
            );
          },
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ProvidersSection — providers & keys as a single list (on-device included)
// ---------------------------------------------------------------------------

function ProvidersSection({
  apiKeys,
  configured,
  showLocalProvider,
  onAdd,
  onEdit,
  onDelete,
}: {
  apiKeys: ApiKeyEntry[];
  configured: ConfiguredModel[];
  showLocalProvider: boolean;
  onAdd: () => void;
  onEdit: (provider: string) => void;
  onDelete: (provider: string) => void;
}): React.JSX.Element {
  if (apiKeys.length === 0 && !showLocalProvider) {
    return (
      <section className="border-border bg-card rounded-[14px] border border-dashed px-8 py-12 text-center">
        <div className="bg-accent/60 mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl">
          <Cpu className="text-accent-foreground h-6 w-6" />
        </div>
        <h2
          className="serif text-foreground m-0"
          style={{
            fontSize: 30,
            lineHeight: 1.05,
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        >
          No providers yet.
        </h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-[420px] text-[13px] leading-relaxed">
          Pick a voice model above — paste your API key once, and Freestyle
          remembers it.
        </p>
        <div className="mx-auto mt-5 flex max-w-[420px] flex-col gap-2">
          {RECOMMENDED_PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={onAdd}
              className="border-border bg-background hover:bg-secondary/60 flex items-center gap-3 rounded-[10px] border px-4 py-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-foreground text-[13.5px] font-medium">
                    {p.name}
                  </span>
                  {p.recommended && (
                    <span
                      className="mono bg-primary text-primary-foreground rounded-full px-1.5 py-[2px] text-[9px]"
                      style={{ letterSpacing: "0.12em" }}
                    >
                      RECOMMENDED
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground mt-0.5 text-[11.5px]">
                  {p.desc}
                </div>
              </div>
              <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="pt-3">
      <div className="mb-3 flex items-center justify-between">
        <Eyebrow text="Providers & keys" />
        <button
          type="button"
          onClick={onAdd}
          className="border-border text-foreground hover:bg-secondary flex shrink-0 items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[12px] font-medium"
        >
          <Plus size={13} />
          Add provider
        </button>
      </div>

      <div className="border-border bg-card overflow-hidden rounded-[12px] border">
        {apiKeys.map((entry, i) => (
          <ProviderRow
            key={entry.provider}
            providerId={entry.provider}
            configured={configured}
            first={i === 0}
            onEdit={() => onEdit(entry.provider)}
            onDelete={() => onDelete(entry.provider)}
          />
        ))}
        {showLocalProvider && (
          <LocalProviderRow
            first={apiKeys.length === 0}
            modelCount={
              configured.filter((m) => m.provider === "local-whisper").length
            }
          />
        )}
      </div>
    </section>
  );
}

function ProviderRow({
  providerId,
  configured,
  first,
  onEdit,
  onDelete,
}: {
  providerId: string;
  configured: ConfiguredModel[];
  first: boolean;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const models = configured.filter((m) => m.provider === providerId);
  const count = models.length;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-[18px] py-[13px]",
        !first && "border-border border-t",
      )}
    >
      <Key className="text-muted-foreground h-[15px] w-[15px] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-foreground text-[13.5px] font-semibold">
          {displayName(providerId)}
        </div>
        <div className="mono text-muted-foreground mt-0.5 text-[11px]">
          Key stored in keychain
        </div>
      </div>
      <span className="text-muted-foreground text-[11.5px]">
        {count} model{count === 1 ? "" : "s"}
      </span>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="text-muted-foreground hover:text-foreground hover:bg-secondary rounded p-1.5"
          title="Edit API key"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive hover:bg-secondary rounded p-1.5"
          title="Delete provider"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function LocalProviderRow({
  first,
  modelCount,
}: {
  first: boolean;
  modelCount: number;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-[18px] py-[13px]",
        !first && "border-border border-t",
      )}
    >
      <Laptop className="text-primary h-[15px] w-[15px] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-foreground text-[13.5px] font-semibold">
          On-device · whisper.cpp
        </div>
        <div className="mono text-muted-foreground mt-0.5 text-[11px]">
          No key needed · runs locally
        </div>
      </div>
      <span className="text-muted-foreground text-[11.5px]">
        {modelCount} model{modelCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function ModalShell({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,12,4,0.35)] backdrop-blur-[4px]">
      <div className="border-border bg-card w-full max-w-md rounded-[14px] border p-7 shadow-[0_24px_60px_-16px_rgba(20,12,4,0.4)]">
        {children}
      </div>
    </div>
  );
}

function ApiKeyDialog({
  model,
  provider,
  form,
  show,
  setShow,
  onClose,
  onSubmit,
}: {
  model: AvailableModel;
  provider: string;
  form: ReturnType<typeof useForm<ApiKeyInput>>;
  show: boolean;
  setShow: (v: boolean) => void;
  onClose: () => void;
  onSubmit: (data: ApiKeyInput) => Promise<void>;
}): React.JSX.Element {
  return (
    <ModalShell>
      <div className="mb-4 flex items-start gap-3.5">
        <div className="bg-accent/60 border-primary/20 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border">
          <Key className="text-accent-foreground h-[18px] w-[18px]" />
        </div>
        <div className="flex-1">
          <h3 className="text-foreground m-0 text-[17px] font-semibold">
            API key required
          </h3>
          <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
            To use{" "}
            <span className="text-foreground/80 font-medium">
              {model.model_name}
            </span>
            , paste your{" "}
            <span className="text-foreground/80 font-medium">
              {displayName(provider, model.provider_name)}
            </span>{" "}
            API key.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X size={18} />
        </button>
      </div>

      <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="relative">
          <Key className="text-muted-foreground absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            type={show ? "text" : "password"}
            {...form.register("key")}
            placeholder="sk-…"
            className={cn(
              "border-border bg-background mono w-full rounded-md border py-2.5 pl-9 pr-10 text-[13px]",
              form.formState.errors.key && "border-destructive",
            )}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {form.formState.errors.key && (
          <p className="text-destructive text-xs">
            {form.formState.errors.key.message}
          </p>
        )}
        <p
          className="mono text-muted-foreground text-[10px] uppercase"
          style={{ letterSpacing: "0.14em" }}
        >
          Stored in keychain · never logged
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="border-border hover:bg-secondary rounded-md border px-3.5 py-1.5 text-[12.5px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!form.formState.isValid}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-3.5 py-1.5 text-[12.5px] font-medium disabled:opacity-50"
          >
            Save &amp; continue
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function EditKeyDialog({
  provider,
  value,
  setValue,
  show,
  setShow,
  onClose,
  onSave,
}: {
  provider: string;
  value: string;
  setValue: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
}): React.JSX.Element {
  return (
    <ModalShell>
      <div className="mb-4 flex items-start gap-3.5">
        <div className="bg-accent/60 border-primary/20 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border">
          <Pencil className="text-accent-foreground h-[18px] w-[18px]" />
        </div>
        <div className="flex-1">
          <h3 className="text-foreground m-0 text-[17px] font-semibold">
            Update API key
          </h3>
          <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
            Enter a new API key for{" "}
            <span className="text-foreground/80 font-medium">
              {displayName(provider)}
            </span>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X size={18} />
        </button>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Key className="text-muted-foreground absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk-…"
            className="border-border bg-background mono w-full rounded-md border py-2.5 pl-9 pr-10 text-[13px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) onSave();
              if (e.key === "Escape") onClose();
            }}
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="border-border hover:bg-secondary rounded-md border px-3.5 py-1.5 text-[12.5px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!value.trim()}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-3.5 py-1.5 text-[12.5px] font-medium disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function DeleteDialog({
  provider,
  blockedBy,
  onCancel,
  onConfirm,
}: {
  provider: string;
  blockedBy: string[];
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}): React.JSX.Element {
  const blocked = blockedBy.length > 0;
  return (
    <ModalShell>
      {blocked ? (
        <>
          <div className="mb-4 flex items-start gap-3.5">
            <div className="bg-destructive/10 border-destructive/30 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border">
              <AlertTriangle className="text-destructive h-[18px] w-[18px]" />
            </div>
            <div>
              <h3 className="text-foreground m-0 text-[17px] font-semibold">
                Cannot delete
              </h3>
              <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
                <span className="text-foreground/80 font-medium">
                  {displayName(provider)}
                </span>{" "}
                is currently used by active models. Change these before
                deleting:
              </p>
              <ul className="mt-2 space-y-1">
                {blockedBy.map((m) => (
                  <li
                    key={m}
                    className="text-destructive text-[13px] font-medium"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="border-border hover:bg-secondary rounded-md border px-3.5 py-1.5 text-[12.5px]"
            >
              OK
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4">
            <h3 className="text-foreground m-0 text-[17px] font-semibold">
              Delete provider
            </h3>
            <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
              Are you sure you want to delete the{" "}
              <span className="text-foreground/80 font-medium">
                {displayName(provider)}
              </span>{" "}
              API key? This will also remove all configured models for this
              provider.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="border-border hover:bg-secondary rounded-md border px-3.5 py-1.5 text-[12.5px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md px-3.5 py-1.5 text-[12.5px] font-medium"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}
