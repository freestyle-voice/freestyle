import type { EndpointConnectFormValues } from "@freestyle-voice/validations";
import {
  localLlmConnectFormSchema,
  openaiSttConnectFormSchema,
} from "@freestyle-voice/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@renderer/components/ui/input-group";
import { Progress } from "@renderer/components/ui/progress";
import { RevealToggle } from "@renderer/components/ui/reveal-toggle";
import { useCloudAuth } from "@renderer/lib/auth-context";
import type {
  AvailableModel,
  WhisperModelDownloadState,
} from "@renderer/lib/models";
import { formatBytes, formatSpeed } from "@renderer/lib/models";
import { cn, ON_DEVICE_PHRASE } from "@renderer/lib/utils";
import {
  ArrowLeft,
  Check,
  Download,
  Key,
  Laptop,
  Loader2,
  LogIn,
  Mic,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, type Resolver, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  PICKER_MODAL_BODY,
  PickerModalHeader,
  PickerOption,
} from "./picker-option";
import {
  FREESTYLE_CLOUD_CLEANUP,
  FREESTYLE_CLOUD_TIER,
  OpenModelSourceButton,
  recommendedVoiceKey,
  TranscriptionPicker,
} from "./transcription-picker";
import type { ConfiguredModel } from "./types";
import type { EndpointConnectState, UseModels } from "./use-models";
import { displayName } from "./utils";

// ---------------------------------------------------------------------------
// Normalized row — one shape for cloud + local, voice + LLM.
// ---------------------------------------------------------------------------

interface Row {
  key: string;
  name: string;
  source: "cloud" | "local";
  provider: string; // provider_id, for the provider filter
  meta: string;
  selected: boolean;
  /** Shown by default; non-curated rows live behind "Show all models". */
  curated?: boolean;
  recommended?: boolean;
  hasKey?: boolean;
  status?: WhisperModelDownloadState["status"];
  state?: WhisperModelDownloadState;
  /** A delete request for this local model is in flight. */
  deleting?: boolean;
  onSelect?: () => void;
  onDownload?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
}

/**
 * The single recommended on-device model: MLX Qwen3 on Apple Silicon,
 * Whisper Balanced everywhere else. One badge per list, ever.
 */
interface VoiceHandlers {
  onPickCloud: (model: AvailableModel) => void;
  onPickLocalVoice: (
    defId: string,
    name: string,
    engine?: "whisper" | "mlx",
  ) => void;
  onRequestDeleteLocal: (defId: string, engine?: "whisper" | "mlx") => void;
}

function buildVoiceRows(m: UseModels, h: VoiceHandlers): Row[] {
  const recommendedKey = recommendedVoiceKey(m.voiceItems);
  return m.voiceItems.map((it): Row => {
    if (it.kind === "local") {
      const status = it.status ?? "not_downloaded";
      const sizeNote =
        status !== "ready" && it.sizeBytes != null
          ? ` · ${formatBytes(it.sizeBytes)}`
          : "";
      const defId = it.defId;
      return {
        key: it.key,
        name: it.name,
        source: "local",
        provider: "local",
        meta: `${it.note ?? "On-device"}${sizeNote}`,
        recommended: it.key === recommendedKey,
        selected: it.selected && status === "ready",
        status,
        state: it.state,
        deleting: defId
          ? m.deletingKeys.has(`${it.localEngine ?? "whisper"}:${defId}`)
          : false,
        onSelect: defId
          ? () => h.onPickLocalVoice(defId, it.name, it.localEngine)
          : undefined,
        onDownload: defId
          ? () => m.downloadLocal(defId, it.localEngine)
          : undefined,
        onCancel: defId
          ? () => m.cancelLocal(defId, it.localEngine)
          : undefined,
        onDelete: defId
          ? () => h.onRequestDeleteLocal(defId, it.localEngine)
          : undefined,
        onRetry: defId
          ? () =>
              it.localEngine === "mlx"
                ? void m.retryLocalMlx(defId)
                : m.downloadLocal(defId, "whisper")
          : undefined,
      };
    }

    const providerId = it.available?.provider_id ?? "";
    const cost = it.cost != null ? ` · $${it.cost.toFixed(2)}/hr` : "";
    const note = it.note ? ` · ${it.note}` : "";
    return {
      key: it.key,
      name: it.name,
      source: "cloud",
      provider: providerId,
      meta: `${displayName(providerId, it.provider)}${note}${cost}`,
      selected: it.selected,
      hasKey: it.hasKey,
      onSelect: it.available
        ? () => h.onPickCloud(it.available as AvailableModel)
        : undefined,
    };
  });
}

function buildLlmRows(
  m: UseModels,
  h: { onPickCloud: (model: AvailableModel) => void; onClose: () => void },
): Row[] {
  const rows: Row[] = [];

  for (const [providerId, { providerName, models }] of m.llmModelsByProvider) {
    if (providerId === FREESTYLE_CLOUD_CLEANUP.provider_id) continue;
    for (const model of models) {
      rows.push({
        key: model.model_id,
        name: model.model_name,
        source: "cloud",
        provider: providerId,
        meta: providerName,
        curated: model.curated === true,
        selected:
          m.defaultLlm?.model_id === model.model_id &&
          m.defaultLlm?.provider === model.provider_id,
        hasKey:
          providerId === FREESTYLE_CLOUD_CLEANUP.provider_id ||
          m.keyProviders.has(providerId),
        onSelect: () => h.onPickCloud(model),
      });
    }
  }

  const names = new Set(m.localLlm.models);
  if (m.defaultLlm?.provider === "local-llm") {
    names.add(m.defaultLlm.model_id.replace(/^local-llm\//, ""));
  }
  for (const name of names) {
    const modelId = `local-llm/${name}`;
    rows.push({
      key: `local:${name}`,
      name,
      source: "local",
      provider: "local",
      meta: "On-device",
      curated: true,
      selected:
        m.defaultLlm?.provider === "local-llm" &&
        m.defaultLlm?.model_id === modelId,
      status: "ready",
      onSelect: () => void m.selectLocalLlmModel(name).then(h.onClose),
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// ModelList — header + filter bar + rows
// ---------------------------------------------------------------------------

export function ModelList({
  type,
  voiceView,
  llmView,
  m,
  cloudBusy,
  onClose,
  onPickCloud,
  onPickLocalVoice,
  onRequestDeleteLocal,
}: {
  type: "voice" | "llm";
  voiceView?: "tiers" | "all" | "local" | "cloud";
  llmView?: "tiers" | "all" | "local" | "cloud";
  m: UseModels;
  cloudBusy?: boolean;
  onClose: () => void;
  onPickCloud: (model: AvailableModel) => void;
  onPickLocalVoice: (
    defId: string,
    name: string,
    engine?: "whisper" | "mlx",
  ) => void;
  onRequestDeleteLocal: (defId: string, engine?: "whisper" | "mlx") => void;
}): React.JSX.Element {
  const [search, setSearch] = useState("");
  const openedScopedDirect =
    type === "voice"
      ? voiceView === "cloud" || voiceView === "local"
      : llmView === "cloud" || llmView === "local";
  const [filter, setFilter] = useState(
    voiceView === "cloud" || llmView === "cloud"
      ? "cloud"
      : voiceView === "local" || llmView === "local"
        ? "local"
        : "all",
  );
  const [view, setView] = useState<"tiers" | "all" | "local" | "cloud">(() => {
    if (type === "voice") {
      if (voiceView === "cloud") return "cloud";
      if (voiceView === "local") return "local";
      if (voiceView === "all") return "all";
      return voiceView ?? "tiers";
    }
    if (llmView === "cloud") return "cloud";
    if (llmView === "local") return "local";
    if (llmView === "all") return "all";
    return llmView ?? "tiers";
  });
  const [showAllLlm, setShowAllLlm] = useState(false);

  if (type === "voice" && view === "tiers") {
    return (
      <TranscriptionPicker
        m={m}
        busy={cloudBusy}
        onClose={onClose}
        onPickCloud={onPickCloud}
        onBrowseLocal={() => setView("local")}
        onBrowseCloud={() => setView("cloud")}
      />
    );
  }

  if (type === "llm" && view === "tiers") {
    return (
      <CleanupTierPicker
        m={m}
        onClose={onClose}
        onBrowseLocal={() => setView("local")}
        onBrowseCloud={() => setView("cloud")}
      />
    );
  }

  const cloudOnly = view === "cloud";
  const localOnly = view === "local";
  const scopedOnly = cloudOnly || localOnly;

  const rows =
    type === "voice"
      ? buildVoiceRows(m, {
          onPickCloud,
          onPickLocalVoice,
          onRequestDeleteLocal,
        })
      : buildLlmRows(m, { onPickCloud, onClose });

  const q = search.toLowerCase();
  // Curated-only for LLM until expanded; searching always searches everything.
  const curatedOnly = type === "llm" && !showAllLlm && !q;
  const filteredRows = rows.filter((r) => {
    if (localOnly && r.source !== "local") return false;
    if (cloudOnly) {
      if (r.source !== "cloud") return false;
      if (
        r.provider === FREESTYLE_CLOUD_TIER.provider_id ||
        r.provider === FREESTYLE_CLOUD_CLEANUP.provider_id
      ) {
        return false;
      }
    }
    if (filter === "cloud" && r.source !== "cloud") return false;
    if (filter === "local" && r.source !== "local") return false;
    if (
      filter !== "all" &&
      filter !== "cloud" &&
      filter !== "local" &&
      r.provider !== filter
    )
      return false;
    if (q && !`${r.name} ${r.meta}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const visible = filteredRows.filter((r) => {
    if (curatedOnly && !r.curated) return false;
    return true;
  });
  const hiddenCount = curatedOnly
    ? filteredRows.length - filteredRows.filter((r) => r.curated).length
    : 0;

  const showLocalLlmForm = type === "llm" && localOnly;
  const showOpenaiSttForm = type === "voice" && cloudOnly;

  const scopedTitle =
    type === "voice"
      ? localOnly
        ? "On-device models"
        : cloudOnly
          ? "Cloud models"
          : "All voice models"
      : localOnly
        ? "On-device cleanup"
        : cloudOnly
          ? "Cloud cleanup models"
          : "All cleanup models";

  return (
    <>
      <header className="border-border shrink-0 border-b px-5 py-3.5">
        <div className="flex items-center gap-3">
          {type === "voice" && !openedScopedDirect ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("tiers")}
              className="shrink-0 gap-1.5"
              aria-label="Back to simple view"
            >
              <ArrowLeft data-icon="inline-start" />
              <Mic />
            </Button>
          ) : type === "llm" && !openedScopedDirect ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("tiers")}
              className="shrink-0 gap-1.5"
              aria-label="Back to simple view"
            >
              <ArrowLeft data-icon="inline-start" />
              <Sparkles />
            </Button>
          ) : type === "voice" && localOnly ? (
            <Laptop className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          ) : type === "voice" ? (
            <Key className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          ) : type === "llm" && localOnly ? (
            <Laptop className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          ) : (
            <Key className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          )}
          <span className="text-foreground min-w-0 flex-1 text-[13px] font-semibold">
            {scopedTitle}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="shrink-0"
            aria-label="Close"
          >
            <X />
          </Button>
        </div>
        <InputGroup className="mt-3 h-9 rounded-md">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models…"
            className="placeholder:text-muted-foreground/70 text-[12.5px]"
          />
        </InputGroup>
      </header>

      {!scopedOnly && <FilterBar active={filter} onChange={setFilter} />}

      {type === "voice" && localOnly && m.whisperStatus?.binaryDownloading && (
        <div className="border-border flex items-center gap-2.5 border-b px-5 py-3">
          <Loader2 className="text-primary h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="text-muted-foreground text-[12px]">
            Building whisper.cpp from source — this may take a minute…
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {showLocalLlmForm && <LocalLlmConnect m={m} />}
        {showOpenaiSttForm && <OpenaiSttConnect m={m} />}
        {visible.length === 0 ? (
          <ListEmptyState
            type={type}
            localOnly={localOnly}
            showLlmConnect={showLocalLlmForm}
            connected={m.localLlm.connected}
          />
        ) : (
          visible.map((row, i) => (
            <ModelRow key={row.key} row={row} first={i === 0} />
          ))
        )}
        {hiddenCount > 0 && (
          <Button
            variant="ghost"
            onClick={() => setShowAllLlm(true)}
            className="border-border text-muted-foreground hover:text-foreground h-auto w-full justify-start rounded-none border-t px-5 py-3 text-left text-[12.5px] font-normal"
          >
            Show all models ({hiddenCount} more) →
          </Button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Filter bar — source filters only (provider chips add noise in advanced view)
// ---------------------------------------------------------------------------

function FilterBar({
  active,
  onChange,
}: {
  active: string;
  onChange: (id: string) => void;
}): React.JSX.Element {
  const sources = [
    { id: "all", label: "All" },
    { id: "cloud", label: "Cloud" },
    { id: "local", label: "On-device" },
  ];

  return (
    <div className="border-border flex flex-wrap items-center gap-2 border-b px-5 py-2.5">
      {sources.map((f) => (
        <Chip
          key={f.id}
          label={f.label}
          on={active === f.id}
          onClick={() => onChange(f.id)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <Button
      variant={on ? "default" : "outline"}
      size="xs"
      onClick={onClick}
      className="rounded-full"
    >
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function ModelRow({
  row,
  first,
}: {
  row: Row;
  first: boolean;
}): React.JSX.Element {
  const cloud = useCloudAuth();
  const local = row.source === "local";
  const isFreestyleCloud =
    row.provider === FREESTYLE_CLOUD_TIER.provider_id ||
    row.provider === FREESTYLE_CLOUD_CLEANUP.provider_id;
  const status = row.status ?? "not_downloaded";
  const downloading =
    local && (status === "downloading" || status === "verifying");

  return (
    <div
      className={cn(
        "group grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5",
        !first && "border-border border-t",
        row.selected && "bg-primary/[0.06]",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-foreground truncate text-[14px] font-medium">
            {row.name}
          </span>
          {row.selected && (
            <Check size={14} className="text-primary shrink-0" />
          )}
          {row.recommended && !row.selected && (
            <Badge
              variant="secondary"
              className="shrink-0 text-[10px] font-semibold"
            >
              Recommended
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground mt-0.5 text-[12px]">
          {row.meta}
        </div>
        {local && status === "error" && row.state?.error && (
          <div className="text-destructive mt-1 text-[11.5px] leading-snug">
            {row.state.error}
          </div>
        )}
        {downloading && <DownloadProgress state={row.state} />}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 justify-self-end">
        {row.selected ? (
          <span className="text-primary text-[11px] font-semibold">
            Selected
          </span>
        ) : local ? (
          <>
            {status === "ready" && (
              <>
                <Button variant="ink" size="sm" onClick={row.onSelect}>
                  Use
                </Button>
                {row.onDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={row.onDelete}
                    disabled={row.deleting}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove downloaded model from disk"
                    title="Remove downloaded model from disk"
                  >
                    {row.deleting ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                  </Button>
                )}
              </>
            )}
            {status === "not_downloaded" && (
              <Button variant="outline" size="sm" onClick={row.onDownload}>
                <Download data-icon="inline-start" />
                Download
              </Button>
            )}
            {downloading && (
              <Button variant="outline" size="sm" onClick={row.onCancel}>
                <X data-icon="inline-start" />
                Cancel
              </Button>
            )}
            {status === "error" && (
              <>
                {row.state?.errorSourceUrl && (
                  <OpenModelSourceButton url={row.state.errorSourceUrl} />
                )}
                <Button variant="outline" size="sm" onClick={row.onRetry}>
                  <RefreshCw data-icon="inline-start" />
                  Retry
                </Button>
              </>
            )}
          </>
        ) : isFreestyleCloud ? (
          cloud.user ? (
            <Button variant="ink" size="sm" onClick={row.onSelect}>
              Use
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={row.onSelect}>
              <LogIn data-icon="inline-start" />
              Sign in to use
            </Button>
          )
        ) : row.hasKey ? (
          <Button variant="ink" size="sm" onClick={row.onSelect}>
            Use
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={row.onSelect}>
            <Key data-icon="inline-start" />
            Add key
          </Button>
        )}
      </div>
    </div>
  );
}

function DownloadProgress({
  state,
}: {
  state?: WhisperModelDownloadState;
}): React.JSX.Element {
  const p = state?.downloadProgress;
  return (
    <div className="mt-2 space-y-1">
      <Progress
        value={p ? p.percent : 100}
        className={cn("h-[5px]", !p && "animate-pulse")}
      />
      <div className="text-muted-foreground mono flex justify-between text-[10px]">
        {p ? (
          <>
            <span>
              {formatBytes(p.bytesDownloaded)} / {formatBytes(p.bytesTotal)}
            </span>
            <span>
              {p.speedBps > 0 && formatSpeed(p.speedBps)}
              {p.percent > 0 && ` · ${p.percent}%`}
            </span>
          </>
        ) : (
          <span>
            {state?.phase === "building_binary"
              ? "Preparing runtime…"
              : "Verifying…"}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local LLM connect form (shown under the On-device filter for LLM)
// ---------------------------------------------------------------------------

function ListEmptyState({
  type,
  localOnly,
  showLlmConnect,
  connected,
}: {
  type: "voice" | "llm";
  localOnly: boolean;
  showLlmConnect: boolean;
  connected: boolean | null;
}): React.JSX.Element | null {
  if (showLlmConnect) {
    if (connected !== true) return null;
    return (
      <p className="text-muted-foreground px-5 py-8 text-center text-[13px]">
        No models found on this server.
      </p>
    );
  }

  if (type === "voice" && localOnly) {
    return (
      <p className="text-muted-foreground px-5 py-8 text-center text-[13px]">
        No on-device transcription models on this device.
      </p>
    );
  }

  return (
    <p className="text-muted-foreground px-5 py-10 text-center text-[13px]">
      No models match.
    </p>
  );
}

function LocalLlmConnect({ m }: { m: UseModels }): React.JSX.Element {
  return (
    <EndpointConnectForm
      connect={m.localLlm}
      resolver={zodResolver(localLlmConnectFormSchema)}
      description="Connect to Ollama, LM Studio, or another OpenAI-compatible server running locally."
      urlPlaceholder="http://localhost:11434"
    />
  );
}

function OpenaiSttConnect({ m }: { m: UseModels }): React.JSX.Element {
  return (
    <EndpointConnectForm
      connect={m.openaiStt}
      resolver={zodResolver(openaiSttConnectFormSchema)}
      description="Point OpenAI transcription at a self-hosted or OpenAI-compatible server (vLLM, LiteLLM, LM Studio). Leave the URL empty to use OpenAI."
      urlPlaceholder="https://example.com/v1"
    />
  );
}

/**
 * Shared connect form for OpenAI-compatible endpoints (local LLM, custom STT).
 * Drives a react-hook-form with inline validation from the shared schema; the
 * Test button persists the values then probes the endpoint via the hook.
 */
function EndpointConnectForm({
  connect,
  resolver,
  description,
  urlPlaceholder,
}: {
  connect: EndpointConnectState;
  resolver: Resolver<EndpointConnectFormValues>;
  description: string;
  urlPlaceholder: string;
}): React.JSX.Element {
  const [showKey, setShowKey] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EndpointConnectFormValues>({
    resolver,
    defaultValues: { url: connect.initialUrl, apiKey: connect.initialApiKey },
    mode: "onBlur",
  });

  // Seed the form once the persisted values resolve. react-hook-form owns the
  // state afterwards, so later cache updates don't clobber in-progress edits.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!connect.initialUrl && !connect.initialApiKey) return;
    seededRef.current = true;
    reset({ url: connect.initialUrl, apiKey: connect.initialApiKey });
  }, [connect.initialUrl, connect.initialApiKey, reset]);

  return (
    <div className="border-border border-b px-5 py-4">
      <p className="text-muted-foreground mb-4 text-[13px] leading-relaxed">
        {description}
      </p>
      <form
        onSubmit={handleSubmit((values) => connect.test(values))}
        className="space-y-3"
      >
        <Controller
          control={control}
          name="url"
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                name={field.name}
                ref={field.ref}
                value={field.value}
                onChange={(e) => {
                  field.onChange(e);
                  connect.clearStatus();
                }}
                onBlur={field.onBlur}
                placeholder={urlPlaceholder}
                aria-invalid={errors.url ? true : undefined}
                className="min-w-0 flex-1"
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={connect.testing}
                className="shrink-0"
              >
                {connect.testing ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Testing…
                  </span>
                ) : (
                  "Test"
                )}
              </Button>
            </div>
          )}
        />
        {errors.url && (
          <p className="text-destructive text-[12px] leading-snug">
            {errors.url.message}
          </p>
        )}
        <Controller
          control={control}
          name="apiKey"
          render={({ field }) => (
            <InputGroup>
              <InputGroupInput
                type={showKey ? "text" : "password"}
                name={field.name}
                ref={field.ref}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="API key (optional)"
              />
              <RevealToggle
                revealed={showKey}
                onToggle={() => setShowKey(!showKey)}
                label="API key"
              />
            </InputGroup>
          )}
        />
        {connect.connected === true && (
          <p className="text-primary text-[12px]">
            Connected · {connect.models.length}{" "}
            {connect.models.length === 1 ? "model" : "models"} found
          </p>
        )}
        {connect.connected === false && connect.error && (
          <p className="text-destructive text-[12px] leading-snug">
            {connect.error}
          </p>
        )}
      </form>
    </div>
  );
}

const MANAGED_LLM_PROVIDERS = new Set([
  FREESTYLE_CLOUD_CLEANUP.provider_id,
  "local-llm",
]);

function isLocalLlm(llm: ConfiguredModel | undefined): boolean {
  return llm?.provider === "local-llm";
}

function isByokLlm(llm: ConfiguredModel | undefined): boolean {
  if (!llm) return false;
  return !MANAGED_LLM_PROVIDERS.has(llm.provider);
}

/** On-device and BYOK only — Freestyle cleanup ships with Freestyle Transcribe. */
function CleanupTierPicker({
  m,
  onClose,
  onBrowseLocal,
  onBrowseCloud,
}: {
  m: UseModels;
  onClose: () => void;
  onBrowseLocal: () => void;
  onBrowseCloud: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();

  const byokCount = [...m.llmModelsByProvider.entries()].reduce(
    (sum, [providerId, { models }]) =>
      providerId === FREESTYLE_CLOUD_CLEANUP.provider_id
        ? sum
        : sum + models.length,
    0,
  );

  const localActive = isLocalLlm(m.defaultLlm);
  const byokActive = isByokLlm(m.defaultLlm);

  const localHint = localActive
    ? (m.defaultLlm?.model_name ?? t("models.onDevice"))
    : m.localLlm.connected === true
      ? t("models.picker.modelCount", { count: m.localLlm.models.length })
      : t("models.picker.ollamaHint");

  const byokLabel = byokActive
    ? (m.defaultLlm?.model_name ?? displayName(m.defaultLlm!.provider))
    : byokCount > 0
      ? t("models.picker.cloudModelCount", { count: byokCount })
      : t("models.picker.byokProviders");

  return (
    <>
      <PickerModalHeader
        icon={Sparkles}
        title={t("models.picker.cleanup")}
        onClose={onClose}
      />
      <div className={PICKER_MODAL_BODY}>
        <div className="border-border divide-border overflow-hidden rounded-[12px] border divide-y">
          <PickerOption
            icon={Laptop}
            title={t("models.picker.onDevice", { phrase: ON_DEVICE_PHRASE })}
            hint={localHint}
            active={localActive}
            onClick={onBrowseLocal}
            browseLabel={t("models.picker.browseLocalCleanup")}
          />
          <PickerOption
            icon={Key}
            title={t("models.picker.yourApiKey")}
            hint={byokLabel}
            active={byokActive}
            onClick={onBrowseCloud}
            browseLabel={t("models.picker.browseByokCleanup")}
          />
        </div>
      </div>
    </>
  );
}
