import { PROVIDER_FILTER_MARKS } from "@renderer/components/model-row";
import type {
  AvailableModel,
  VoiceItem,
  WhisperModelDownloadState,
} from "@renderer/lib/models";
import { formatBytes, formatSpeed } from "@renderer/lib/models";
import { cn } from "@renderer/lib/utils";
import {
  ArrowLeft,
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
import { useEffect, useState } from "react";
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
  // Voice opens on the simple three-tier view; LLM opens on the curated list.
  const [view, setView] = useState<"tiers" | "all">(
    type === "voice" ? "tiers" : "all",
  );
  const [showAllLlm, setShowAllLlm] = useState(false);

  if (type === "voice" && view === "tiers") {
    return (
      <VoiceTiers
        m={m}
        onClose={onClose}
        onPickCloud={onPickCloud}
        onPickLocalVoice={onPickLocalVoice}
        onShowAll={() => setView("all")}
      />
    );
  }

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
  const visible = rows.filter((r) => {
    if (curatedOnly && !r.curated) return false;
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
  const hiddenCount = curatedOnly
    ? rows.length - rows.filter((r) => r.curated).length
    : 0;

  const showLocalLlmForm =
    type === "llm" && (filter === "all" || filter === "local");

  return (
    <>
      <header className="border-border flex shrink-0 items-center gap-3 border-b px-5 py-3.5">
        {type === "voice" ? (
          <button
            type="button"
            onClick={() => setView("tiers")}
            className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5"
            aria-label="Back to simple view"
          >
            <ArrowLeft size={14} />
            <Mic className="h-3.5 w-3.5" />
          </button>
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

      <FilterBar rows={rows} active={filter} onChange={setFilter} />

      {type === "voice" && m.whisperStatus?.binaryDownloading && (
        <div className="border-border flex items-center gap-2.5 border-b px-5 py-3">
          <Loader2 className="text-primary h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="text-muted-foreground text-[12px]">
            Building whisper.cpp from source — this may take a minute…
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {showLocalLlmForm && <LocalLlmConnect m={m} />}
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
// VoiceTiers — the simple picker: three meaningful choices, no model IDs.
// ---------------------------------------------------------------------------

const ACCURATE_TIER: AvailableModel = {
  provider_id: "openai",
  provider_name: "OpenAI",
  model_id: "openai/gpt-4o-transcribe",
  model_name: "OpenAI Transcribe",
  type: "voice",
};

const FASTEST_TIER: AvailableModel = {
  provider_id: "groq",
  provider_name: "Groq",
  model_id: "groq/whisper-large-v3-turbo",
  model_name: "Groq Whisper",
  type: "voice",
};

function VoiceTiers({
  m,
  onClose,
  onPickCloud,
  onPickLocalVoice,
  onShowAll,
}: {
  m: UseModels;
  onClose: () => void;
  onPickCloud: (model: AvailableModel) => void;
  onPickLocalVoice: (
    defId: string,
    name: string,
    engine?: "whisper" | "mlx",
  ) => void;
  onShowAll: () => void;
}): React.JSX.Element {
  const privateItem = m.voiceItems.find(
    (it) => it.key === recommendedVoiceKey(m.voiceItems),
  );
  const status = privateItem?.status ?? "not_downloaded";
  const downloading = status === "downloading" || status === "verifying";
  // Selecting "Private" downloads if needed, then commits once ready.
  const [autoSelect, setAutoSelect] = useState(false);

  useEffect(() => {
    if (autoSelect && privateItem?.defId && status === "ready") {
      setAutoSelect(false);
      onPickLocalVoice(
        privateItem.defId,
        privateItem.name,
        privateItem.localEngine,
      );
    }
  }, [autoSelect, status, privateItem, onPickLocalVoice]);

  function pickPrivate(): void {
    if (!privateItem?.defId) return;
    if (status === "ready") {
      onPickLocalVoice(
        privateItem.defId,
        privateItem.name,
        privateItem.localEngine,
      );
      return;
    }
    if (status === "not_downloaded" || status === "error") {
      setAutoSelect(true);
      m.downloadLocal(privateItem.defId, privateItem.localEngine);
    }
  }

  const isSelected = (modelId: string, provider: string): boolean =>
    m.defaultVoice?.provider === provider &&
    m.defaultVoice?.model_id === modelId;

  return (
    <>
      <header className="border-border flex shrink-0 items-center gap-3 border-b px-5 py-3.5">
        <Mic className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        <span
          className="mono text-foreground flex-1 text-[11px] uppercase"
          style={{ letterSpacing: "0.14em" }}
        >
          How should Freestyle transcribe?
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
        <TierCard
          title="Private"
          badge="Recommended"
          description="Runs on your device. Nothing leaves it. Free."
          detail={
            downloading
              ? undefined
              : (privateItem &&
                  `${privateItem.name}${
                    status !== "ready" && privateItem.sizeBytes
                      ? ` · ${formatBytes(privateItem.sizeBytes)} download`
                      : ""
                  }`) ||
                undefined
          }
          selected={privateItem?.selected ?? false}
          disabled={!privateItem || downloading}
          onClick={pickPrivate}
        >
          {downloading && <Progress state={privateItem?.state} />}
          {status === "error" && privateItem?.state?.error && (
            <p className="text-destructive mt-1.5 text-[11px] leading-snug">
              {privateItem.state.error}
            </p>
          )}
        </TierCard>
        <TierCard
          title="Most accurate"
          description="OpenAI cloud — needs an API key (~$0.18/hr)."
          detail={
            m.keyProviders.has("openai") ? "Key added" : "We'll ask for a key"
          }
          selected={isSelected(ACCURATE_TIER.model_id, "openai")}
          onClick={() => onPickCloud(ACCURATE_TIER)}
        />
        <TierCard
          title="Fastest"
          description="Groq cloud — needs an API key (~$0.04/hr)."
          detail={
            m.keyProviders.has("groq") ? "Key added" : "We'll ask for a key"
          }
          selected={isSelected(FASTEST_TIER.model_id, "groq")}
          onClick={() => onPickCloud(FASTEST_TIER)}
        />
      </div>

      <footer className="border-border flex items-center justify-between border-t px-5 py-3">
        <button
          type="button"
          onClick={onShowAll}
          className="text-muted-foreground hover:text-foreground text-[12.5px]"
        >
          All models →
        </button>
        <button
          type="button"
          onClick={onClose}
          className="border-border hover:bg-secondary rounded-md border px-3.5 py-1.5 text-[12.5px]"
        >
          Cancel
        </button>
      </footer>
    </>
  );
}

function TierCard({
  title,
  badge,
  description,
  detail,
  selected,
  disabled,
  onClick,
  children,
}: {
  title: string;
  badge?: string;
  description: string;
  detail?: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "border-border hover:border-primary/50 hover:bg-secondary/40 flex flex-col items-start rounded-[12px] border p-4 text-left transition-colors disabled:cursor-default",
        selected && "border-primary bg-primary/[0.06]",
      )}
    >
      <div className="flex w-full items-center gap-2">
        <span className="text-foreground text-[14.5px] font-semibold">
          {title}
        </span>
        {selected && <Check size={14} className="text-primary shrink-0" />}
        {badge && !selected && (
          <span
            className="mono bg-primary/10 text-primary ml-auto rounded-full px-2 py-0.5 text-[9px] uppercase"
            style={{ letterSpacing: "0.1em" }}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="text-muted-foreground mt-1.5 text-[12px] leading-relaxed">
        {description}
      </p>
      {detail && (
        <p className="text-muted-foreground/80 mono mt-2 text-[10.5px]">
          {detail}
        </p>
      )}
      {children && <div className="mt-2 w-full">{children}</div>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Filter bar — single-select source + provider chips
// ---------------------------------------------------------------------------

function FilterBar({
  rows,
  active,
  onChange,
}: {
  rows: Row[];
  active: string;
  onChange: (id: string) => void;
}): React.JSX.Element {
  const providers: { id: string; label: string; mark?: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.source !== "cloud" || seen.has(r.provider)) continue;
    seen.add(r.provider);
    providers.push({
      id: r.provider,
      label: displayName(r.provider),
      mark: PROVIDER_FILTER_MARKS[r.provider],
    });
  }

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
      {providers.length > 0 && (
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

function LocalLlmConnect({ m }: { m: UseModels }): React.JSX.Element {
  const [showKey, setShowKey] = useState(false);
  const { localLlm } = m;

  return (
    <div className="border-border border-b">
      <div className="flex items-center gap-2 px-5 pb-2 pt-3">
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
            placeholder="http://localhost:11434"
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
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={localLlm.apiKey}
            onChange={(e) => localLlm.setApiKey(e.target.value)}
            placeholder="API key (optional)"
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
        {localLlm.connected === true && (
          <p className="text-primary text-[12px]">
            Connected ({localLlm.models.length}{" "}
            {localLlm.models.length === 1 ? "model" : "models"})
          </p>
        )}
        {localLlm.connected === false && (
          <p className="text-destructive text-[12px]">{localLlm.error}</p>
        )}
      </form>
    </div>
  );
}
