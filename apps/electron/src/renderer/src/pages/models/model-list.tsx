import {
  normalizeOpenApiCompatibleEndpoint,
  OPENAPI_CLOUD_PROVIDER_IDS,
  OPENAPI_ENDPOINT_PRESETS,
} from "@freestyle/validations";
import { PROVIDER_FILTER_MARKS } from "@renderer/components/model-row";
import type {
  AvailableModel,
  VoiceItem,
  WhisperModelDownloadState,
} from "@renderer/lib/models";
import { formatBytes, formatSpeed } from "@renderer/lib/models";
import { cn } from "@renderer/lib/utils";
import {
  Check,
  Download,
  Eye,
  EyeOff,
  Key,
  Laptop,
  Loader2,
  Mic,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import type { UseModels } from "./use-models";
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
  onSelect?: () => void;
  onDownload?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
}

interface OpenApiCredentialUi {
  placeholder: string;
}

interface OpenApiModelUi {
  placeholder: string;
  hint: string;
}

function getOpenApiCredentialUi(presetId: string | null): OpenApiCredentialUi {
  switch (presetId) {
    case "openrouter":
      return { placeholder: "OpenRouter API key" };
    case "azure":
      return { placeholder: "Azure API key" };
    case "moonshot":
      return { placeholder: "Moonshot API key" };
    case "together":
      return { placeholder: "Together API key" };
    case "fireworks":
      return { placeholder: "Fireworks API key" };
    case "deepinfra":
      return { placeholder: "DeepInfra API key" };
    case "sambanova":
      return { placeholder: "SambaNova API key" };
    default:
      return { placeholder: "API key or token (optional)" };
  }
}

function getOpenApiModelUi(presetId: string | null): OpenApiModelUi {
  switch (presetId) {
    case "azure":
      return {
        placeholder: "Deployment name (for example: gpt-4.1-mini)",
        hint: "Azure usually needs the deployment name you created, even when shared model discovery is unavailable.",
      };
    case "openrouter":
      return {
        placeholder: "Model ID (for example: openai/gpt-4.1-mini)",
        hint: "If model discovery is unavailable, enter the full OpenRouter model ID manually.",
      };
    case "deepinfra":
      return {
        placeholder: "Model ID (for example: deepseek-ai/DeepSeek-V3)",
        hint: "DeepInfra model names are usually provider-prefixed. If discovery is unavailable, enter the full catalog model ID manually.",
      };
    default:
      return {
        placeholder: "Model or deployment name",
        hint: "Needed for Azure and any compatible endpoint that does not expose /models.",
      };
  }
}

function getOpenApiCompatibleProviderLabel(endpoint: string): string {
  const normalized =
    normalizeOpenApiCompatibleEndpoint(endpoint) ?? endpoint.trim();
  try {
    const url = new URL(normalized);
    if (url.hostname.endsWith(".openai.azure.com")) return "Azure OpenAI";
    if (url.hostname === "api.openai.com") return "OpenAI";
    if (url.hostname === "openrouter.ai") return "OpenRouter";
    if (url.hostname === "api.moonshot.cn") return "Moonshot";
    if (url.hostname === "api.together.ai") return "Together AI";
    if (url.hostname === "api.fireworks.ai") return "Fireworks AI";
    if (url.hostname === "api.deepinfra.com") return "DeepInfra";
    if (url.hostname === "api.sambanova.ai") return "SambaNova";
    if (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    ) {
      return "Local OpenAPI";
    }
  } catch {
    // Fall through to generic label.
  }
  return "OpenAPI Compatible";
}

/**
 * The single recommended on-device model: MLX Qwen3 on Apple Silicon,
 * Whisper Balanced everywhere else. One badge per list, ever.
 */
function recommendedVoiceKey(items: VoiceItem[]): string {
  return items.some((it) => it.localEngine === "mlx")
    ? "local-mlx/qwen3-0.6b-8bit"
    : "local-whisper/small-q5_1";
}

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
  const localProviderLabel = getOpenApiCompatibleProviderLabel(m.localLlm.url);

  for (const [providerId, { providerName, models }] of m.llmModelsByProvider) {
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
        hasKey: m.keyProviders.has(providerId),
        onSelect: () => h.onPickCloud(model),
      });
    }
  }

  // Collect every model the configured OpenAPI-compatible endpoint serves.
  // The server returns them in `available` on every load, but the UI was only
  // showing models discovered during the current test session, so they
  // disappeared after reopening the page.
  const names = new Set(m.localLlm.models);
  for (const model of m.available) {
    if (model.type === "llm" && model.provider_id === "local-llm") {
      names.add(model.model_id.replace(/^local-llm\//, ""));
    }
  }
  if (m.defaultLlm?.provider === "local-llm") {
    names.add(m.defaultLlm.model_id.replace(/^local-llm\//, ""));
  }
  for (const name of names) {
    const modelId = `local-llm/${name}`;
    rows.push({
      key: `local:${name}`,
      name,
      source: "local",
      provider: "local-llm",
      meta: `${localProviderLabel} endpoint`,
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
  m,
  onClose,
  onPickCloud,
  onPickLocalVoice,
  onRequestDeleteLocal,
}: {
  type: "voice" | "llm";
  m: UseModels;
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
  const [filter, setFilter] = useState("all");
  const [showAllLlm, setShowAllLlm] = useState(false);

  const rows =
    type === "voice"
      ? buildVoiceRows(m, {
          onPickCloud,
          onPickLocalVoice,
          onRequestDeleteLocal,
        })
      : buildLlmRows(m, { onPickCloud, onClose });

  // The OpenAPI-compatible provider shelf is part of the LLM picker. In the
  // voice picker the same providers are folded into the existing filter-chip
  // row so they do not push the model list out of the modal.
  const showLocalLlmForm = type === "llm";
  const activePresetId = filter.startsWith("preset:")
    ? filter.slice("preset:".length)
    : null;
  const activePreset = OPENAPI_ENDPOINT_PRESETS.find(
    (p) => p.id === activePresetId,
  );

  const handleFilterChange = useCallback(
    (id: string) => {
      setFilter(id);
      if (type === "voice" && id.startsWith("preset:")) {
        const presetId = id.slice("preset:".length);
        const preset = OPENAPI_ENDPOINT_PRESETS.find((p) => p.id === presetId);
        if (preset) {
          m.localLlm.setUrl(preset.endpoint);
          m.localLlm.clearStatus();
        }
      }
    },
    [type, m.localLlm.setUrl, m.localLlm.clearStatus],
  );

  const q = search.toLowerCase();
  // Curated-only for LLM until expanded; searching always searches everything.
  const curatedOnly = type === "llm" && !showAllLlm && !q;
  const visible = rows.filter((r) => {
    if (curatedOnly && !r.curated) return false;
    if (filter === "cloud" && r.source !== "cloud") return false;
    if (filter === "local" && r.source !== "local") return false;
    if (activePresetId) {
      if (r.provider !== "local-llm") return false;
    } else if (
      filter !== "all" &&
      filter !== "cloud" &&
      filter !== "local" &&
      r.provider !== filter
    ) {
      return false;
    }
    if (q && !`${r.name} ${r.meta}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const hiddenCount = curatedOnly
    ? rows.length - rows.filter((r) => r.curated).length
    : 0;

  return (
    <>
      <header className="border-border flex shrink-0 items-center gap-3 border-b px-5 py-3.5">
        {type === "voice" ? (
          <Mic className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        ) : (
          <Sparkles className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        )}
        <span
          className="mono text-foreground shrink-0 text-[11px] uppercase"
          style={{ letterSpacing: "0.14em" }}
        >
          {type === "voice" ? "All voice models" : "Cleanup model"}
        </span>
        <div className="border-border bg-background ml-3 flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-1">
          <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="placeholder:text-muted-foreground/70 min-w-0 flex-1 border-none bg-transparent text-[12.5px] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </header>

      {showLocalLlmForm && (
        <LocalLlmConnect
          m={m}
          onApply={m.localLlm.applyModel}
          showCards
        />
      )}

      <FilterBar
        rows={rows}
        active={filter}
        onChange={handleFilterChange}
        type={type}
      />

      {activePreset && type === "voice" && (
        <div className="border-border border-b">
          <LocalLlmConnect
            m={m}
            onApply={m.localLlm.applyVoiceModel}
            activePresetId={activePresetId}
          />
        </div>
      )}

      {type === "voice" && m.whisperStatus?.binaryDownloading && (
        <div className="border-border flex items-center gap-2.5 border-b px-5 py-3">
          <Loader2 className="text-primary h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="text-muted-foreground text-[12px]">
            Building whisper.cpp from source — this may take a minute…
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="text-muted-foreground px-5 py-10 text-center text-[13px]">
            No models match.
          </div>
        ) : (
          visible.map((row, i) => (
            <ModelRow key={row.key} row={row} first={i === 0} />
          ))
        )}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllLlm(true)}
            className="border-border text-muted-foreground hover:text-foreground w-full border-t px-5 py-3 text-left text-[12.5px]"
          >
            Show all models ({hiddenCount} more) →
          </button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Filter bar — single-select source + provider chips
// ---------------------------------------------------------------------------

function FilterBar({
  rows,
  active,
  onChange,
  type,
}: {
  rows: Row[];
  active: string;
  onChange: (id: string) => void;
  type: "voice" | "llm";
}): React.JSX.Element {
  const providers: { id: string; label: string; mark?: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.provider)) continue;
    // Keep voice local engines in the On-device bucket only. In the voice
    // picker the OpenAPI-compatible endpoint is represented by preset chips
    // (Azure, Together, …) rather than the generic local-llm provider chip.
    if (type === "voice" && r.source === "local") continue;
    if (type === "voice" && r.provider === "local-llm") continue;
    seen.add(r.provider);
    providers.push({
      id: r.provider,
      label: displayName(r.provider),
      mark: PROVIDER_FILTER_MARKS[r.provider],
    });
  }

  // In the voice picker, surface the OpenAPI-compatible providers as chips in
  // the same filter bar instead of a separate shelf above the list.
  const openApiChips =
    type === "voice"
      ? OPENAPI_ENDPOINT_PRESETS.filter(
          (preset) =>
            !OPENAPI_CLOUD_PROVIDER_IDS.includes(
              preset.id as (typeof OPENAPI_CLOUD_PROVIDER_IDS)[number],
            ),
        ).map((preset) => ({
          id: `preset:${preset.id}`,
          label: preset.label,
          mark: "API" as const,
        }))
      : [];

  const sources = [
    { id: "all", label: "All" },
    { id: "cloud", label: "Cloud" },
    { id: "local", label: "On-device" },
  ];

  const showDivider = providers.length > 0 || openApiChips.length > 0;

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
      {showDivider && (
        <span className="bg-border mx-1 h-4 w-px shrink-0" aria-hidden="true" />
      )}
      {providers.map((p) => (
        <Chip
          key={p.id}
          label={p.label}
          mark={p.mark}
          on={active === p.id}
          onClick={() => onChange(p.id)}
        />
      ))}
      {openApiChips.map((p) => (
        <Chip
          key={p.id}
          label={p.label}
          mark={p.mark}
          on={active === p.id}
          onClick={() => onChange(p.id)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  mark,
  on,
  onClick,
}: {
  label: string;
  mark?: string;
  on: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-secondary/60",
      )}
    >
      {mark && (
        <span
          className="border-current/35 inline-flex h-4 min-w-4 items-center justify-center rounded-full border px-1 text-[8px] font-semibold leading-none"
          aria-hidden="true"
        >
          {mark}
        </span>
      )}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

const SOLID_BTN =
  "bg-foreground text-background hover:bg-foreground/90 rounded-[8px] px-3.5 py-2 text-[12.5px] font-medium";
const GHOST_BTN =
  "border-border hover:bg-secondary flex items-center gap-1.5 rounded-[8px] border px-3 py-2 text-[12.5px] font-medium";

function ModelRow({
  row,
  first,
}: {
  row: Row;
  first: boolean;
}): React.JSX.Element {
  const local = row.source === "local";
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
            <span
              className="mono bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase"
              style={{ letterSpacing: "0.1em" }}
            >
              Recommended
            </span>
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
        {downloading && <Progress state={row.state} />}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 justify-self-end">
        {row.selected ? (
          <span
            className="mono text-primary"
            style={{ fontSize: 10, letterSpacing: "0.14em" }}
          >
            SELECTED
          </span>
        ) : local ? (
          <>
            {status === "ready" && (
              <>
                <button
                  type="button"
                  onClick={row.onSelect}
                  className={SOLID_BTN}
                >
                  Use
                </button>
                {row.onDelete && (
                  <button
                    type="button"
                    onClick={row.onDelete}
                    className="border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 rounded-[8px] border p-2 transition-colors"
                    title="Remove downloaded model from disk"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </>
            )}
            {status === "not_downloaded" && (
              <button
                type="button"
                onClick={row.onDownload}
                className={GHOST_BTN}
              >
                <Download size={13} />
                Download
              </button>
            )}
            {downloading && (
              <button
                type="button"
                onClick={row.onCancel}
                className={GHOST_BTN}
              >
                <X size={12} />
                Cancel
              </button>
            )}
            {status === "error" && (
              <button type="button" onClick={row.onRetry} className={GHOST_BTN}>
                <RefreshCw size={12} />
                Retry
              </button>
            )}
          </>
        ) : row.hasKey ? (
          <button type="button" onClick={row.onSelect} className={SOLID_BTN}>
            Use
          </button>
        ) : (
          <button type="button" onClick={row.onSelect} className={GHOST_BTN}>
            <Key size={12} />
            Add key
          </button>
        )}
      </div>
    </div>
  );
}

function Progress({
  state,
}: {
  state?: WhisperModelDownloadState;
}): React.JSX.Element {
  const p = state?.downloadProgress;
  return (
    <div className="mt-2 space-y-1">
      <div className="bg-secondary h-[5px] w-full overflow-hidden rounded-full">
        {p ? (
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${p.percent}%` }}
          />
        ) : (
          <div className="bg-primary h-full w-full animate-pulse rounded-full" />
        )}
      </div>
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

function LocalLlmConnect({
  m,
  onApply,
  activePresetId: forcedPresetId,
  showCards = false,
}: {
  m: UseModels;
  onApply: () => Promise<void>;
  activePresetId?: string | null;
  showCards?: boolean;
}): React.JSX.Element {
  const [showKey, setShowKey] = useState(false);
  const { localLlm } = m;
  const normalizedUrl =
    normalizeOpenApiCompatibleEndpoint(localLlm.url) ?? localLlm.url.trim();
  const activePresetId =
    forcedPresetId ??
    (OPENAPI_ENDPOINT_PRESETS.find(
      (preset) =>
        normalizeOpenApiCompatibleEndpoint(preset.endpoint) === normalizedUrl,
    )?.id ??
      null);
  const credentialUi = getOpenApiCredentialUi(activePresetId);
  const modelUi = getOpenApiModelUi(activePresetId);

  return (
    <div className="border-border border-b">
      {showCards && (
        <>
          <div className="flex items-center gap-2 px-5 pb-2 pt-3">
            <Laptop className="text-primary h-3 w-3" />
            <span
              className="mono text-foreground text-[10px] uppercase"
              style={{ letterSpacing: "0.14em" }}
            >
              Add a provider
            </span>
            <span className="text-muted-foreground text-[11.5px]">
              Pick a service, enter its key, then test and apply a model
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 px-5 pb-3 sm:grid-cols-3">
            {OPENAPI_ENDPOINT_PRESETS.map((preset) => {
              const active = preset.id === activePresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    localLlm.setUrl(preset.endpoint);
                    localLlm.clearStatus();
                  }}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground hover:border-primary/60 hover:bg-secondary/40",
                  )}
                  title={preset.description}
                >
                  <span className="text-[12px] font-medium">{preset.label}</span>
                  <span className="text-muted-foreground line-clamp-2 text-[10.5px] leading-snug">
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void localLlm.test();
        }}
        className="space-y-2.5 px-5 pb-3.5"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={localLlm.url}
            onChange={(e) => {
              localLlm.setUrl(e.target.value);
              localLlm.clearStatus();
            }}
            placeholder="http://localhost:11434/v1"
            className="border-border bg-background min-w-0 flex-1 rounded-md border px-3 py-2 text-[13px]"
          />
          <button
            type="submit"
            disabled={localLlm.testing}
            className="bg-secondary hover:bg-secondary/80 shrink-0 rounded-md px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-50"
          >
            {localLlm.testing ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Testing…
              </span>
            ) : (
              "Test"
            )}
          </button>
        </div>
        <p className="text-muted-foreground text-[11.5px] leading-relaxed">
          Use a base ending in <code>/v1</code>. If you paste a full{" "}
          <code>/responses</code> or <code>/chat/completions</code> URL, we
          normalize it to the matching <code>/v1</code> base before testing and
          saving.
        </p>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={localLlm.apiKey}
            onChange={(e) => localLlm.setApiKey(e.target.value)}
            placeholder={credentialUi.placeholder}
            className="border-border bg-background w-full rounded-md border px-3 py-2 pr-10 text-[13px]"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={localLlm.modelName}
              onChange={(e) => localLlm.setModelName(e.target.value)}
              placeholder={modelUi.placeholder}
              className="border-border bg-background min-w-0 flex-1 rounded-md border px-3 py-2 text-[13px]"
            />
            <button
              type="button"
              onClick={() => void onApply()}
              disabled={!localLlm.modelName.trim() || localLlm.applyingModel}
              className="bg-secondary hover:bg-secondary/80 shrink-0 rounded-md px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-50"
            >
              {localLlm.applyingModel ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </span>
              ) : (
                "Use model"
              )}
            </button>
          </div>
          <p className="text-muted-foreground text-[11.5px] leading-relaxed">
            {modelUi.hint}
          </p>
        </div>
        {activePresetId && (
          <p className="text-muted-foreground text-[11.5px] leading-relaxed">
            {
              OPENAPI_ENDPOINT_PRESETS.find(
                (preset) => preset.id === activePresetId,
              )?.description
            }
          </p>
        )}
        {localLlm.hint && (
          <p className="text-muted-foreground text-[11.5px] leading-relaxed">
            {localLlm.hint}
          </p>
        )}
        {localLlm.connected === true && (
          <p className="text-primary text-[12px]">
            {localLlm.models.length > 0
              ? `Connected (${localLlm.models.length} ${
                  localLlm.models.length === 1 ? "model" : "models"
                } discovered)`
              : "Connected"}
          </p>
        )}
        {localLlm.connected === false && (
          <p className="text-destructive text-[12px]">{localLlm.error}</p>
        )}
      </form>
    </div>
  );
}
