import {
  type ApiKeyInput,
  apiKeySchema,
  type LocalLlmConfigInput,
  localLlmConfigSchema,
} from "@freestyle/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { getApiBase } from "@renderer/lib/api";
import { cn } from "@renderer/lib/utils";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Mic,
  Monitor,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

/** Canonical display names for providers */
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

function displayName(providerId: string, fallback?: string): string {
  return PROVIDER_DISPLAY_NAMES[providerId] ?? fallback ?? providerId;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ModelsPage(): React.JSX.Element {
  const [available, setAvailable] = useState<AvailableModel[]>([]);
  const [configured, setConfigured] = useState<ConfiguredModel[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [llmCleanup, setLlmCleanup] = useState(false);

  // Dropdowns
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);
  const [llmDropdownOpen, setLlmDropdownOpen] = useState(false);

  // Search
  const [voiceSearch, setVoiceSearch] = useState("");
  const [llmSearch, setLlmSearch] = useState("");

  // Inline API key prompt (shared between voice & llm dropdowns)
  const [pendingKeyProvider, setPendingKeyProvider] = useState<string | null>(
    null,
  );
  const [showPendingKey, setShowPendingKey] = useState(false);
  const [pendingModel, setPendingModel] = useState<AvailableModel | null>(null);
  const [pendingModelType, setPendingModelType] = useState<"voice" | "llm">(
    "voice",
  );

  // Provider key editing (uses the same dialog pattern as new key)
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
  const [localLlmModelDropdownOpen, setLocalLlmModelDropdownOpen] =
    useState(false);

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
      const [
        availRes,
        configRes,
        keysRes,
        cleanupRes,
        localUrlRes,
        localKeyRes,
      ] = await Promise.all([
        fetch(`${getApiBase()}/api/models/available`),
        fetch(`${getApiBase()}/api/models/configured`),
        fetch(`${getApiBase()}/api/keys`),
        fetch(`${getApiBase()}/api/settings/llm_cleanup`),
        fetch(`${getApiBase()}/api/settings/local_llm_url`),
        fetch(`${getApiBase()}/api/settings/local_llm_api_key`),
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
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const voiceModelsByProvider = new Map<
    string,
    { providerName: string; models: AvailableModel[] }
  >();
  for (const m of available) {
    if (m.type !== "voice") continue;
    if (!VOICE_PROVIDERS.includes(m.provider_id)) continue;
    let entry = voiceModelsByProvider.get(m.provider_id);
    if (!entry) {
      entry = {
        providerName: displayName(m.provider_id, m.provider_name),
        models: [],
      };
      voiceModelsByProvider.set(m.provider_id, entry);
    }
    entry.models.push(m);
  }

  const llmModelsByProvider = new Map<
    string,
    { providerName: string; models: AvailableModel[] }
  >();
  for (const m of available) {
    if (m.type !== "llm") continue;
    if (!LLM_PROVIDERS.includes(m.provider_id)) continue;
    // Local models are shown in their own section, not the cloud dropdown
    if (m.provider_id === "local-llm") continue;
    let entry = llmModelsByProvider.get(m.provider_id);
    if (!entry) {
      entry = {
        providerName: displayName(m.provider_id, m.provider_name),
        models: [],
      };
      llmModelsByProvider.set(m.provider_id, entry);
    }
    entry.models.push(m);
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const closePendingKey = useCallback(() => {
    setPendingKeyProvider(null);
    setPendingModel(null);
    setShowPendingKey(false);
    apiKeyForm.reset({ provider: "", key: "" });
  }, [apiKeyForm]);

  const selectModel = useCallback(
    async (model: AvailableModel, type: "voice" | "llm") => {
      // Local providers don't need API keys
      if (
        model.provider_id !== "local-llm" &&
        !keyProviders.has(model.provider_id)
      ) {
        // Show the API key dialog
        setPendingModel(model);
        setPendingKeyProvider(model.provider_id);
        apiKeyForm.reset({ provider: model.provider_id, key: "" });
        setShowPendingKey(false);
        setPendingModelType(type);
        // Close dropdowns so the dialog is clearly visible
        setVoiceDropdownOpen(false);
        setLlmDropdownOpen(false);
        return;
      }

      await fetch(`${getApiBase()}/api/models/configured`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: model.provider_id,
          model_id: model.model_id,
          model_name: model.model_name,
          type,
          is_default: true,
        }),
      });
      setVoiceDropdownOpen(false);
      setLlmDropdownOpen(false);
      setVoiceSearch("");
      setLlmSearch("");
      loadData();
    },
    [keyProviders, loadData],
  );

  const savePendingKeyAndModel = useCallback(
    async (data: ApiKeyInput) => {
      if (!pendingModel) return;

      await fetch(`${getApiBase()}/api/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: data.provider,
          key: data.key,
        }),
      });

      await fetch(`${getApiBase()}/api/models/configured`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: pendingModel.provider_id,
          model_id: pendingModel.model_id,
          model_name: pendingModel.model_name,
          type: pendingModelType,
          is_default: true,
        }),
      });

      closePendingKey();
      setVoiceDropdownOpen(false);
      setLlmDropdownOpen(false);
      setVoiceSearch("");
      setLlmSearch("");
      loadData();
    },
    [pendingModel, pendingModelType, closePendingKey, loadData],
  );

  const saveProviderKey = useCallback(async () => {
    if (!editKeyValue.trim() || !editingProvider) return;
    await fetch(`${getApiBase()}/api/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: editingProvider,
        key: editKeyValue.trim(),
      }),
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
      // Check if any default models use this provider
      const activeModels: string[] = [];
      if (defaultVoice?.provider === provider)
        activeModels.push(`Voice: ${defaultVoice.model_name}`);
      if (defaultLlm?.provider === provider)
        activeModels.push(`LLM: ${defaultLlm.model_name}`);

      if (activeModels.length > 0) {
        setDeleteProvider(provider);
        setDeleteBlockedBy(activeModels);
      } else {
        setDeleteProvider(provider);
        setDeleteBlockedBy([]);
      }
    },
    [defaultVoice, defaultLlm],
  );

  const confirmDeleteProvider = useCallback(async () => {
    if (!deleteProvider) return;
    await fetch(`${getApiBase()}/api/keys/${deleteProvider}`, {
      method: "DELETE",
    });
    const providerModels = configured.filter(
      (m) => m.provider === deleteProvider,
    );
    await Promise.all(
      providerModels.map((m) =>
        fetch(`${getApiBase()}/api/models/configured/${m.id}`, {
          method: "DELETE",
        }),
      ),
    );
    setDeleteProvider(null);
    setDeleteBlockedBy([]);
    loadData();
  }, [deleteProvider, configured, loadData]);

  // -------------------------------------------------------------------------
  // Shared dropdown renderer
  // -------------------------------------------------------------------------

  function renderModelDropdown(
    modelsByProvider: Map<
      string,
      { providerName: string; models: AvailableModel[] }
    >,
    type: "voice" | "llm",
    currentDefault: ConfiguredModel | undefined,
    search: string,
    setSearch: (v: string) => void,
  ) {
    const q = search.toLowerCase();

    return (
      <div className="border-border bg-card absolute z-20 mt-1 max-h-72 w-full overflow-hidden rounded-lg border shadow-lg">
        {/* Search input */}
        <div className="border-border border-b px-3 py-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="bg-background w-full rounded border-none py-1 pl-7 pr-2 text-xs outline-none"
            />
          </div>
        </div>

        {/* Model list */}
        <div className="max-h-56 overflow-y-auto">
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
                  <div className="text-muted-foreground bg-secondary/50 sticky top-0 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider">
                    {providerName}
                    {!keyProviders.has(providerId) && (
                      <span className="text-destructive ml-1.5 normal-case tracking-normal">
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
                        onClick={() => selectModel(model, type)}
                        className={cn(
                          "hover:bg-secondary flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                          isActive && "bg-primary/5",
                        )}
                      >
                        <span className="flex-1">{model.model_name}</span>
                        {isActive && (
                          <Check size={14} className="text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            },
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground text-sm">Loading models...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Models</h1>
        <p className="text-muted-foreground mt-1">
          Configure voice and language models for transcription.
        </p>
      </div>

      {/* ================================================================= */}
      {/* Voice Model (required)                                             */}
      {/* ================================================================= */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">
            Voice Model <span className="text-destructive">*</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            Select the speech-to-text model used for transcription.
          </p>
        </div>

        {!defaultVoice && (
          <div className="border-destructive/50 bg-destructive/5 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <AlertTriangle className="text-destructive h-4 w-4 shrink-0" />
            <span className="text-destructive text-xs">
              No voice model configured. Select one below to start transcribing.
            </span>
          </div>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setVoiceDropdownOpen(!voiceDropdownOpen);
              setLlmDropdownOpen(false);
              setVoiceSearch("");
              closePendingKey();
            }}
            className={cn(
              "border-border hover:bg-secondary flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-sm",
              !defaultVoice && "border-destructive/50",
            )}
          >
            <div className="flex items-center gap-2">
              <Mic className="text-muted-foreground h-4 w-4" />
              {defaultVoice ? (
                <span>
                  {defaultVoice.model_name}{" "}
                  <span className="text-muted-foreground text-xs">
                    ({displayName(defaultVoice.provider)})
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Select a voice model...
                </span>
              )}
            </div>
            <ChevronDown
              className={cn(
                "text-muted-foreground h-4 w-4 transition-transform",
                voiceDropdownOpen && "rotate-180",
              )}
            />
          </button>

          {voiceDropdownOpen &&
            renderModelDropdown(
              voiceModelsByProvider,
              "voice",
              defaultVoice,
              voiceSearch,
              setVoiceSearch,
            )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* Post-processing (optional)                                         */}
      {/* ================================================================= */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Post-processing</h2>
          <p className="text-muted-foreground text-sm">
            Optionally use an LLM to clean up transcribed text before pasting.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            const next = !llmCleanup;
            setLlmCleanup(next);
            fetch(`${getApiBase()}/api/settings/llm_cleanup`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ value: String(next) }),
            }).catch((err) =>
              console.error("Failed to save LLM cleanup:", err),
            );
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
            llmCleanup
              ? "border-primary bg-accent text-accent-foreground"
              : "border-border text-muted-foreground hover:bg-secondary",
          )}
        >
          <Sparkles className="h-4 w-4" />
          <div className="flex-1 text-left">
            <div className="font-medium">LLM Cleanup</div>
            <div className="text-muted-foreground text-xs">
              Fix grammar, punctuation, and formatting after transcription
            </div>
          </div>
          <div
            className={cn(
              "h-5 w-9 shrink-0 rounded-full transition-colors",
              llmCleanup ? "bg-primary" : "bg-border",
            )}
          >
            <div
              className={cn(
                "h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform",
                llmCleanup ? "translate-x-4.5" : "translate-x-0.5",
              )}
            />
          </div>
        </button>

        {llmCleanup && (
          <>
            {/* Cloud / Local toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUseLocalLlm(false)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                  !useLocalLlm
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary",
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Cloud LLM
              </button>
              <button
                type="button"
                onClick={() => setUseLocalLlm(true)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                  useLocalLlm
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary",
                )}
              >
                <Monitor className="h-3.5 w-3.5" />
                Local LLM
              </button>
            </div>

            {useLocalLlm ? (
              <form
                className="space-y-3"
                onSubmit={localLlmForm.handleSubmit(async (data) => {
                  setLocalLlmTesting(true);
                  setLocalLlmConnected(null);
                  setLocalLlmError(null);

                  try {
                    const url = data.url.replace(/\/+$/, "");

                    await Promise.all([
                      fetch(`${getApiBase()}/api/settings/local_llm_url`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ value: url }),
                      }),
                      data.api_key?.trim()
                        ? fetch(
                            `${getApiBase()}/api/settings/local_llm_api_key`,
                            {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                value: data.api_key.trim(),
                              }),
                            },
                          )
                        : fetch(
                            `${getApiBase()}/api/settings/local_llm_api_key`,
                            { method: "DELETE" },
                          ),
                    ]);

                    const res = await fetch(
                      `${getApiBase()}/api/settings/local-llm/test`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          url,
                          api_key: data.api_key?.trim() || undefined,
                        }),
                      },
                    );
                    const result = await res.json();

                    if (result.ok) {
                      setLocalLlmConnected(true);
                      setLocalLlmModels(result.models ?? []);
                      loadData();
                    } else {
                      setLocalLlmConnected(false);
                      setLocalLlmError(result.error ?? "Connection failed");
                    }
                  } catch (err) {
                    setLocalLlmConnected(false);
                    setLocalLlmError(
                      err instanceof Error ? err.message : "Connection failed",
                    );
                  } finally {
                    setLocalLlmTesting(false);
                  }
                })}
              >
                {/* Endpoint URL */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground text-xs font-medium">
                    Endpoint URL
                  </label>
                  <input
                    type="text"
                    {...localLlmForm.register("url", {
                      onChange: () => {
                        setLocalLlmConnected(null);
                        setLocalLlmError(null);
                      },
                    })}
                    placeholder="http://localhost:11434"
                    className={cn(
                      "border-border bg-background w-full rounded-lg border px-3 py-2 text-sm",
                      localLlmForm.formState.errors.url && "border-destructive",
                    )}
                  />
                  {localLlmForm.formState.errors.url && (
                    <p className="text-destructive text-xs">
                      {localLlmForm.formState.errors.url.message}
                    </p>
                  )}
                </div>

                {/* API Key (optional) */}
                <div className="space-y-1.5">
                  <label className="text-muted-foreground text-xs font-medium">
                    API Key{" "}
                    <span className="text-muted-foreground/60">(optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showLocalLlmApiKey ? "text" : "password"}
                      {...localLlmForm.register("api_key")}
                      placeholder="Leave empty if not required"
                      className="border-border bg-background w-full rounded-lg border px-3 py-2 pr-10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLocalLlmApiKey(!showLocalLlmApiKey)}
                      className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      {showLocalLlmApiKey ? (
                        <EyeOff size={14} />
                      ) : (
                        <Eye size={14} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Test Connection */}
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={localLlmTesting}
                    className="bg-secondary hover:bg-secondary/80 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {localLlmTesting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Testing...
                      </span>
                    ) : (
                      "Test Connection"
                    )}
                  </button>

                  {localLlmConnected === true && (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      Connected ({localLlmModels.length}{" "}
                      {localLlmModels.length === 1 ? "model" : "models"})
                    </span>
                  )}
                  {localLlmConnected === false && (
                    <span className="text-destructive text-xs">
                      {localLlmError}
                    </span>
                  )}
                </div>

                {/* Local model dropdown */}
                {localLlmModels.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setLocalLlmModelDropdownOpen(!localLlmModelDropdownOpen)
                      }
                      className="border-border hover:bg-secondary flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Monitor className="text-muted-foreground h-4 w-4" />
                        {defaultLlm?.provider === "local-llm" ? (
                          <span>{defaultLlm.model_name}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            Select a local model...
                          </span>
                        )}
                      </div>
                      <ChevronDown
                        className={cn(
                          "text-muted-foreground h-4 w-4 transition-transform",
                          localLlmModelDropdownOpen && "rotate-180",
                        )}
                      />
                    </button>

                    {localLlmModelDropdownOpen && (
                      <div className="border-border bg-card absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border shadow-lg">
                        {localLlmModels.map((modelName) => {
                          const modelId = `local-llm/${modelName}`;
                          const isActive =
                            defaultLlm?.model_id === modelId &&
                            defaultLlm?.provider === "local-llm";
                          return (
                            <button
                              key={modelName}
                              type="button"
                              onClick={async () => {
                                await fetch(
                                  `${getApiBase()}/api/models/configured`,
                                  {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      provider: "local-llm",
                                      model_id: modelId,
                                      model_name: modelName,
                                      type: "llm",
                                      is_default: true,
                                    }),
                                  },
                                );
                                setLocalLlmModelDropdownOpen(false);
                                loadData();
                              }}
                              className={cn(
                                "hover:bg-secondary flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                                isActive && "bg-primary/5",
                              )}
                            >
                              <span className="flex-1">{modelName}</span>
                              {isActive && (
                                <Check size={14} className="text-primary" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </form>
            ) : (
              /* Cloud LLM model dropdown (existing) */
              <div className="space-y-2">
                {defaultLlm?.provider === "local-llm" && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Select a cloud model below to switch from local.
                  </div>
                )}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setLlmDropdownOpen(!llmDropdownOpen);
                      setVoiceDropdownOpen(false);
                      setLlmSearch("");
                      closePendingKey();
                    }}
                    className="border-border hover:bg-secondary flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="text-muted-foreground h-4 w-4" />
                      {defaultLlm && defaultLlm.provider !== "local-llm" ? (
                        <span>
                          {defaultLlm.model_name}{" "}
                          <span className="text-muted-foreground text-xs">
                            ({displayName(defaultLlm.provider)})
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Select an LLM model...
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      className={cn(
                        "text-muted-foreground h-4 w-4 transition-transform",
                        llmDropdownOpen && "rotate-180",
                      )}
                    />
                  </button>

                  {llmDropdownOpen &&
                    renderModelDropdown(
                      llmModelsByProvider,
                      "llm",
                      defaultLlm,
                      llmSearch,
                      setLlmSearch,
                    )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ================================================================= */}
      {/* Providers (API Key Management)                                     */}
      {/* ================================================================= */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Providers</h2>
          <p className="text-muted-foreground text-sm">
            Manage API keys for your configured providers.
          </p>
        </div>

        {apiKeys.length === 0 ? (
          <div className="border-border rounded-lg border border-dashed px-4 py-6 text-center">
            <Key className="text-muted-foreground mx-auto mb-2 h-6 w-6" />
            <p className="text-muted-foreground text-sm">
              No providers configured yet. Select a model above to get started.
            </p>
          </div>
        ) : (
          <div className="border-border divide-border divide-y rounded-lg border">
            {apiKeys.map((entry) => {
              const providerModels = configured.filter(
                (m) => m.provider === entry.provider,
              );
              return (
                <div
                  key={entry.provider}
                  className="group flex items-center gap-3 px-4 py-3"
                >
                  <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                    <Key size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {displayName(entry.provider)}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      API key configured
                      {providerModels.length > 0 && (
                        <span>
                          {" "}
                          &middot; {providerModels.length}{" "}
                          {providerModels.length === 1 ? "model" : "models"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => startEditProvider(entry.provider)}
                      className="text-muted-foreground hover:text-foreground rounded p-1.5"
                      title="Edit API key"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => tryDeleteProvider(entry.provider)}
                      className="text-muted-foreground hover:text-destructive rounded p-1.5"
                      title="Delete provider"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* API Key Dialog (shared for voice + LLM)                           */}
      {/* ================================================================= */}
      {pendingKeyProvider && pendingModel && (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-card border-border w-full max-w-md rounded-xl border p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">API Key Required</h3>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  To use{" "}
                  <span className="text-foreground font-medium">
                    {pendingModel.model_name}
                  </span>
                  , enter your{" "}
                  <span className="text-foreground font-medium">
                    {displayName(
                      pendingKeyProvider,
                      pendingModel.provider_name,
                    )}
                  </span>{" "}
                  API key.
                </p>
              </div>
              <button
                type="button"
                onClick={closePendingKey}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>
            <form
              className="space-y-4"
              onSubmit={apiKeyForm.handleSubmit(savePendingKeyAndModel)}
            >
              <div>
                <div className="relative">
                  <Key className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                  <input
                    type={showPendingKey ? "text" : "password"}
                    {...apiKeyForm.register("key")}
                    placeholder="sk-..."
                    className={cn(
                      "border-border bg-background w-full rounded-lg border py-2.5 pl-10 pr-10 font-mono text-sm",
                      apiKeyForm.formState.errors.key && "border-destructive",
                    )}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") closePendingKey();
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPendingKey(!showPendingKey)}
                    className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    {showPendingKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {apiKeyForm.formState.errors.key && (
                  <p className="text-destructive mt-1 text-xs">
                    {apiKeyForm.formState.errors.key.message}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closePendingKey}
                  className="border-border hover:bg-secondary rounded-lg border px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!apiKeyForm.formState.isValid}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  Save & Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Edit Provider Key Dialog                                          */}
      {/* ================================================================= */}
      {editingProvider && (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-card border-border w-full max-w-md rounded-xl border p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Update API Key</h3>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  Enter a new API key for{" "}
                  <span className="text-foreground font-medium">
                    {displayName(editingProvider)}
                  </span>
                  .
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditProvider}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="relative">
                <Key className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <input
                  type={showEditKey ? "text" : "password"}
                  value={editKeyValue}
                  onChange={(e) => setEditKeyValue(e.target.value)}
                  placeholder="sk-..."
                  className="border-border bg-background w-full rounded-lg border py-2.5 pl-10 pr-10 font-mono text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editKeyValue.trim())
                      saveProviderKey();
                    if (e.key === "Escape") closeEditProvider();
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowEditKey(!showEditKey)}
                  className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showEditKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditProvider}
                  className="border-border hover:bg-secondary rounded-lg border px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveProviderKey}
                  disabled={!editKeyValue.trim()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Delete Provider Confirmation Dialog                               */}
      {/* ================================================================= */}
      {deleteProvider && (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-card border-border w-full max-w-md rounded-xl border p-6 shadow-xl">
            {deleteBlockedBy.length > 0 ? (
              <>
                <div className="mb-4 flex items-start gap-3">
                  <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold">Cannot Delete</h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                      <span className="text-foreground font-medium">
                        {displayName(deleteProvider)}
                      </span>{" "}
                      is currently used by active models. Please change these
                      models before deleting:
                    </p>
                    <ul className="mt-2 space-y-1">
                      {deleteBlockedBy.map((model) => (
                        <li
                          key={model}
                          className="text-destructive text-sm font-medium"
                        >
                          {model}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteProvider(null);
                      setDeleteBlockedBy([]);
                    }}
                    className="border-border hover:bg-secondary rounded-lg border px-4 py-2 text-sm"
                  >
                    OK
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <h3 className="text-lg font-semibold">Delete Provider</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Are you sure you want to delete the{" "}
                    <span className="text-foreground font-medium">
                      {displayName(deleteProvider)}
                    </span>{" "}
                    API key? This will also remove all configured models for
                    this provider.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteProvider(null);
                      setDeleteBlockedBy([]);
                    }}
                    className="border-border hover:bg-secondary rounded-lg border px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeleteProvider}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg px-4 py-2 text-sm font-medium"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
