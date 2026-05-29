import {
  type ApiKeyInput,
  apiKeySchema,
  type LocalLlmConfigInput,
  localLlmConfigSchema,
} from "@freestyle/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { getClient } from "@renderer/lib/api";
import { cn } from "@renderer/lib/utils";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Cpu,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Mic,
  Monitor,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AvailableModel {
  provider_id: string;
  provider_name: string;
  model_id: string;
  model_name: string;
  family: string;
  type: "voice" | "llm";
}

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

const VOICE_PROVIDERS = ["openai", "groq", "deepgram", "elevenlabs"];
const LLM_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "groq",
  "mistral",
  "local-llm",
];

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  groq: "Groq",
  deepgram: "Deepgram",
  elevenlabs: "ElevenLabs",
  mistral: "Mistral",
  openrouter: "OpenRouter",
  "local-llm": "Local LLM",
};

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
  return PROVIDER_DISPLAY_NAMES[providerId] ?? fallback ?? providerId;
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

  // Local LLM
  const [useLocalLlm, setUseLocalLlm] = useState(false);
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
        const defaultLlmConfig = configs.find(
          (m) => m.type === "llm" && m.is_default === 1,
        );
        if (defaultLlmConfig?.provider === "local-llm") {
          setUseLocalLlm(true);
        }
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

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const voiceModelsByProvider = groupByProvider(available, "voice");
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
      // Local LLM has its own dedicated section, not the cloud picker
      if (type === "llm" && m.provider_id === "local-llm") continue;
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

  const hasAnyProvider = apiKeys.length > 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <PageShell>
      <PageHeader
        title="Models"
        subtitle="Configure voice and language models for transcription."
      />
      <div className="space-y-7">
        {hasAnyProvider && (
          <div ref={pairCardRef}>
            <PairCard
              voice={defaultVoice}
              llm={defaultLlm}
              llmCleanup={llmCleanup}
              onToggleCleanup={setCleanupOn}
              onChangeVoice={() => openPicker("voice")}
              onChangeLlm={() => openPicker("llm")}
              pickerOpen={pickerOpen}
            />
          </div>
        )}

        {/* Inline picker — appears below the pair card */}
        {pickerOpen && (
          <div ref={pickerRef}>
            <ModelPicker
              type={pickerOpen}
              modelsByProvider={
                pickerOpen === "voice"
                  ? voiceModelsByProvider
                  : llmModelsByProvider
              }
              currentDefault={
                pickerOpen === "voice" ? defaultVoice : defaultLlm
              }
              search={pickerSearch}
              setSearch={setPickerSearch}
              keyProviders={keyProviders}
              onSelect={(m) => selectModel(m, pickerOpen)}
              onClose={closePicker}
            />
          </div>
        )}

        {/* Local LLM toggle + config — only shown when cleanup is on */}
        {llmCleanup && hasAnyProvider && (
          <LocalLlmSection
            useLocalLlm={useLocalLlm}
            setUseLocalLlm={setUseLocalLlm}
            form={localLlmForm}
            showApiKey={showLocalLlmApiKey}
            setShowApiKey={setShowLocalLlmApiKey}
            testing={localLlmTesting}
            connected={localLlmConnected}
            error={localLlmError}
            models={localLlmModels}
            defaultLlm={defaultLlm}
            onTest={testLocalLlm}
            onClearStatus={() => {
              setLocalLlmConnected(null);
              setLocalLlmError(null);
            }}
            onSelectLocalModel={async (modelName) => {
              const modelId = `local-llm/${modelName}`;
              await getClient().api.models.configured.$post({
                json: {
                  provider: "local-llm",
                  model_id: modelId,
                  model_name: modelName,
                  type: "llm",
                  is_default: true,
                },
              });
              loadData();
            }}
          />
        )}

        {/* Providers section */}
        <ProvidersSection
          apiKeys={apiKeys}
          configured={configured}
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
// PageHeader — editorial title with italic accent
// ---------------------------------------------------------------------------

function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}): React.JSX.Element {
  return (
    <div className="mb-7">
      <h1 className="serif text-foreground m-0 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
        <span className="serif-italic text-primary">{title}</span>
        <span>. </span>
      </h1>
      {subtitle && (
        <p className="text-muted-foreground mt-2.5 max-w-[580px] text-[14px] leading-[1.5]">
          {subtitle}
        </p>
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
          modelName={llm?.model_name}
          providerName={llm ? displayName(llm.provider) : undefined}
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

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-[22px] w-10 shrink-0 rounded-full border transition-colors",
        on ? "bg-primary border-primary/80" : "bg-secondary border-border",
      )}
      aria-pressed={on}
    >
      <span
        className={cn(
          "absolute top-[1px] block h-[18px] w-[18px] rounded-full transition-transform",
          on ? "bg-primary-foreground" : "bg-muted-foreground/70",
        )}
        style={{ transform: on ? "translateX(19px)" : "translateX(2px)" }}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// ModelPicker — inline picker that opens below the pair card
// ---------------------------------------------------------------------------

function ModelPicker({
  type,
  modelsByProvider,
  currentDefault,
  search,
  setSearch,
  keyProviders,
  onSelect,
  onClose,
}: {
  type: "voice" | "llm";
  modelsByProvider: Map<
    string,
    { providerName: string; models: AvailableModel[] }
  >;
  currentDefault: ConfiguredModel | undefined;
  search: string;
  setSearch: (v: string) => void;
  keyProviders: Set<string>;
  onSelect: (m: AvailableModel) => void;
  onClose: () => void;
}): React.JSX.Element {
  const q = search.toLowerCase();
  const Icon = type === "voice" ? Mic : Sparkles;

  return (
    <section className="border-border bg-card overflow-hidden rounded-[14px] border">
      <header className="border-border flex items-center gap-2.5 border-b px-5 py-3.5">
        <Icon className="text-muted-foreground h-3.5 w-3.5" />
        <span
          className="mono text-foreground text-[11px] uppercase"
          style={{ letterSpacing: "0.14em" }}
        >
          {type === "voice" ? "Pick a voice model" : "Pick an LLM model"}
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
      <div className="max-h-[320px] overflow-y-auto">
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
                      onClick={() => onSelect(model)}
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
// LocalLlmSection — Cloud/Local toggle + local config when local is on
// ---------------------------------------------------------------------------

function LocalLlmSection({
  useLocalLlm,
  setUseLocalLlm,
  form,
  showApiKey,
  setShowApiKey,
  testing,
  connected,
  error,
  models,
  defaultLlm,
  onTest,
  onClearStatus,
  onSelectLocalModel,
}: {
  useLocalLlm: boolean;
  setUseLocalLlm: (v: boolean) => void;
  form: ReturnType<typeof useForm<LocalLlmConfigInput>>;
  showApiKey: boolean;
  setShowApiKey: (v: boolean) => void;
  testing: boolean;
  connected: boolean | null;
  error: string | null;
  models: string[];
  defaultLlm: ConfiguredModel | undefined;
  onTest: (e?: React.BaseSyntheticEvent) => Promise<void>;
  onClearStatus: () => void;
  onSelectLocalModel: (modelName: string) => Promise<void>;
}): React.JSX.Element {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className="mono text-muted-foreground text-[10px] uppercase"
          style={{ letterSpacing: "0.14em" }}
        >
          LLM Source
        </span>
        <div className="border-border bg-secondary ml-2 inline-flex rounded-md border p-[3px]">
          <SegmentButton
            active={!useLocalLlm}
            onClick={() => setUseLocalLlm(false)}
            icon={<Sparkles className="h-3 w-3" />}
          >
            Cloud
          </SegmentButton>
          <SegmentButton
            active={useLocalLlm}
            onClick={() => setUseLocalLlm(true)}
            icon={<Monitor className="h-3 w-3" />}
          >
            Local
          </SegmentButton>
        </div>
      </div>

      {useLocalLlm && (
        <form
          onSubmit={onTest}
          className="border-border bg-card space-y-3 rounded-[12px] border p-5"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="models-local-llm-url"
              className="mono text-muted-foreground block text-[10px] uppercase"
              style={{ letterSpacing: "0.14em" }}
            >
              Endpoint URL
            </label>
            <input
              id="models-local-llm-url"
              type="text"
              {...form.register("url", { onChange: onClearStatus })}
              placeholder="http://localhost:11434"
              className={cn(
                "border-border bg-background w-full rounded-md border px-3 py-2 text-[13px]",
                form.formState.errors.url && "border-destructive",
              )}
            />
            {form.formState.errors.url && (
              <p className="text-destructive text-xs">
                {form.formState.errors.url.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="models-local-llm-api-key"
              className="mono text-muted-foreground block text-[10px] uppercase"
              style={{ letterSpacing: "0.14em" }}
            >
              API Key <span className="normal-case opacity-60">(optional)</span>
            </label>
            <div className="relative">
              <input
                id="models-local-llm-api-key"
                type={showApiKey ? "text" : "password"}
                {...form.register("api_key")}
                placeholder="Leave empty if not required"
                className="border-border bg-background w-full rounded-md border px-3 py-2 pr-10 text-[13px]"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
              >
                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={testing}
              className="bg-secondary hover:bg-secondary/80 rounded-md px-4 py-1.5 text-[12.5px] font-medium disabled:opacity-50"
            >
              {testing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Testing…
                </span>
              ) : (
                "Test Connection"
              )}
            </button>
            {connected === true && (
              <span className="text-primary text-xs">
                Connected ({models.length}{" "}
                {models.length === 1 ? "model" : "models"})
              </span>
            )}
            {connected === false && (
              <span className="text-destructive text-xs">{error}</span>
            )}
          </div>

          {models.length > 0 && (
            <div className="border-border space-y-1 border-t pt-3">
              <span
                className="mono text-muted-foreground block text-[10px] uppercase"
                style={{ letterSpacing: "0.14em" }}
              >
                Available local models
              </span>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {models.map((m) => {
                  const modelId = `local-llm/${m}`;
                  const isActive =
                    defaultLlm?.model_id === modelId &&
                    defaultLlm?.provider === "local-llm";
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onSelectLocalModel(m)}
                      className={cn(
                        "border-border hover:bg-secondary/60 flex items-center justify-between rounded-md border px-3 py-2 text-left text-[12.5px]",
                        isActive && "border-primary/40 bg-primary/5",
                      )}
                    >
                      <span className="truncate">{m}</span>
                      {isActive && (
                        <Check size={13} className="text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </form>
      )}
    </section>
  );
}

function SegmentButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] transition-colors",
        active
          ? "bg-card border-border text-foreground border font-medium shadow-[0_1px_2px_rgba(20,12,4,0.04)]"
          : "text-muted-foreground hover:text-foreground border border-transparent",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ProvidersSection — list of configured providers as cards (2-col grid)
// ---------------------------------------------------------------------------

function ProvidersSection({
  apiKeys,
  configured,
  onAdd,
  onEdit,
  onDelete,
}: {
  apiKeys: ApiKeyEntry[];
  configured: ConfiguredModel[];
  onAdd: () => void;
  onEdit: (provider: string) => void;
  onDelete: (provider: string) => void;
}): React.JSX.Element {
  if (apiKeys.length === 0) {
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
          Pick a voice model below — paste your API key once, and Freestyle
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
    <section>
      <div className="mb-3.5 flex items-baseline justify-between">
        <div>
          <h2
            className="serif-italic text-foreground m-0"
            style={{ fontSize: 24, lineHeight: 1 }}
          >
            Providers
          </h2>
          <p className="text-muted-foreground mt-1 text-[13px]">
            Manage API keys. Keys are stored in your system keychain.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 border-border text-foreground hover:bg-secondary flex items-center gap-1.5 rounded-[7px] border px-3 py-1.5 text-[12.5px] font-medium"
        >
          <Plus size={13} />
          Add provider
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {apiKeys.map((entry) => (
          <ProviderCard
            key={entry.provider}
            providerId={entry.provider}
            configured={configured}
            onEdit={() => onEdit(entry.provider)}
            onDelete={() => onDelete(entry.provider)}
          />
        ))}
      </div>
    </section>
  );
}

function ProviderCard({
  providerId,
  configured,
  onEdit,
  onDelete,
}: {
  providerId: string;
  configured: ConfiguredModel[];
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const models = configured.filter((m) => m.provider === providerId);
  const voice = models.find((m) => m.type === "voice");
  const llm = models.find((m) => m.type === "llm");
  const activeAs =
    voice?.is_default === 1
      ? "voice"
      : llm?.is_default === 1
        ? "llm"
        : undefined;

  return (
    <div className="group border-border bg-card flex items-center gap-3.5 rounded-[11px] border px-4 py-3.5">
      <div className="bg-accent/60 border-primary/20 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
        <Key className="text-accent-foreground h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-[13.5px] font-medium">
            {displayName(providerId)}
          </span>
          {activeAs && (
            <span
              className="mono bg-primary text-primary-foreground rounded-full px-1.5 py-[2px] text-[9px]"
              style={{ letterSpacing: "0.12em" }}
            >
              ACTIVE
            </span>
          )}
        </div>
        <div className="text-muted-foreground mt-0.5 truncate text-[11.5px]">
          {voice?.model_name && <span>{voice.model_name}</span>}
          {voice?.model_name && llm?.model_name && <span> · </span>}
          {llm?.model_name && <span>{llm.model_name}</span>}
          {!voice?.model_name && !llm?.model_name && (
            <span>No models configured</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="text-muted-foreground hover:text-foreground hover:bg-secondary rounded p-1.5"
          title="Edit API key"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive hover:bg-secondary rounded p-1.5"
          title="Delete provider"
        >
          <Trash2 size={13} />
        </button>
      </div>
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
