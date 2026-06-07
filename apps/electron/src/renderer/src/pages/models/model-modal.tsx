import {
  LlmModelRow,
  ProviderModelHeader,
} from "@renderer/components/model-row";
import { VoiceRow } from "@renderer/components/voice-row";
import type { AvailableModel } from "@renderer/lib/models";
import { cn } from "@renderer/lib/utils";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Key,
  Laptop,
  Loader2,
  Mic,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";

import type { ConfiguredModel } from "./types";
import type { UseModels } from "./use-models";
import { displayName } from "./utils";

// ---------------------------------------------------------------------------
// Modal state — owned by the page; the modal renders from it.
// ---------------------------------------------------------------------------

export type ModalState =
  | { kind: "list"; type: "voice" | "llm" }
  | {
      kind: "key";
      /** Slot to return to on Back; null = standalone key edit. */
      type: "voice" | "llm" | null;
      provider: string;
      modelName?: string;
      /** Model to configure after the key is saved (null for edits). */
      pendingModel: AvailableModel | null;
    };

// ---------------------------------------------------------------------------
// Shared modal shell
// ---------------------------------------------------------------------------

function Backdrop({
  onClose,
  label,
  children,
}: {
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,12,4,0.35)] p-6 backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="border-border bg-card flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[14px] border shadow-[0_24px_60px_-16px_rgba(20,12,4,0.4)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModelModal
// ---------------------------------------------------------------------------

export function ModelModal({
  modal,
  m,
  saving,
  keyError,
  onClose,
  onPickCloud,
  onPickLocalVoice,
  onRequestDeleteLocal,
  onBack,
  onSaveKey,
}: {
  modal: ModalState;
  m: UseModels;
  saving: boolean;
  keyError: string | null;
  onClose: () => void;
  onPickCloud: (model: AvailableModel) => void;
  onPickLocalVoice: (
    defId: string,
    name: string,
    engine?: "whisper" | "mlx",
  ) => void;
  onRequestDeleteLocal: (defId: string, engine?: "whisper" | "mlx") => void;
  onBack: () => void;
  onSaveKey: (key: string) => void;
}): React.JSX.Element {
  if (modal.kind === "key") {
    return (
      <Backdrop onClose={onClose} label="Add API key">
        <KeyStep
          provider={modal.provider}
          modelName={modal.modelName}
          canGoBack={modal.type !== null}
          saving={saving}
          error={keyError}
          onBack={onBack}
          onClose={onClose}
          onSave={onSaveKey}
        />
      </Backdrop>
    );
  }

  return (
    <Backdrop
      onClose={onClose}
      label={
        modal.type === "voice" ? "Choose a voice model" : "Pick an LLM model"
      }
    >
      {modal.type === "voice" ? (
        <VoiceList
          m={m}
          onPickCloud={onPickCloud}
          onPickLocalVoice={onPickLocalVoice}
          onRequestDeleteLocal={onRequestDeleteLocal}
          onClose={onClose}
        />
      ) : (
        <LlmList m={m} onPickCloud={onPickCloud} onClose={onClose} />
      )}
    </Backdrop>
  );
}

// ---------------------------------------------------------------------------
// Header with search
// ---------------------------------------------------------------------------

function ListHeader({
  icon: Icon,
  title,
  search,
  setSearch,
  onClose,
}: {
  icon: typeof Mic;
  title: string;
  search: string;
  setSearch: (v: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <header className="border-border flex shrink-0 items-center gap-3 border-b px-5 py-3.5">
      <Icon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
      <span
        className="mono text-foreground shrink-0 text-[11px] uppercase"
        style={{ letterSpacing: "0.14em" }}
      >
        {title}
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
  );
}

// ---------------------------------------------------------------------------
// Voice list
// ---------------------------------------------------------------------------

function VoiceList({
  m,
  onPickCloud,
  onPickLocalVoice,
  onRequestDeleteLocal,
  onClose,
}: {
  m: UseModels;
  onPickCloud: (model: AvailableModel) => void;
  onPickLocalVoice: (
    defId: string,
    name: string,
    engine?: "whisper" | "mlx",
  ) => void;
  onRequestDeleteLocal: (defId: string, engine?: "whisper" | "mlx") => void;
  onClose: () => void;
}): React.JSX.Element {
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();
  const list = q
    ? m.voiceItems.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          it.provider.toLowerCase().includes(q),
      )
    : m.voiceItems;

  return (
    <>
      <ListHeader
        icon={Mic}
        title="Choose a voice model"
        search={search}
        setSearch={setSearch}
        onClose={onClose}
      />
      {m.whisperStatus?.binaryDownloading && (
        <div className="border-border flex items-center gap-2.5 border-b px-5 py-3">
          <Loader2 className="text-primary h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="text-muted-foreground text-[12px]">
            Building whisper.cpp from source — this may take a minute…
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <Empty />
        ) : (
          list.map((item, i) => (
            <VoiceRow
              key={item.key}
              item={item}
              first={i === 0}
              onSelectCloud={onPickCloud}
              onSelectLocal={onPickLocalVoice}
              onDownload={m.downloadLocal}
              onRetryLocal={(defId, engine) =>
                engine === "mlx"
                  ? void m.retryLocalMlx(defId)
                  : m.downloadLocal(defId, "whisper")
              }
              onCancel={m.cancelLocal}
              onDelete={onRequestDeleteLocal}
            />
          ))
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// LLM list (cloud providers + local server)
// ---------------------------------------------------------------------------

function LlmList({
  m,
  onPickCloud,
  onClose,
}: {
  m: UseModels;
  onPickCloud: (model: AvailableModel) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();
  const { defaultLlm } = m;

  const groups = [...m.llmModelsByProvider.entries()]
    .map(([providerId, { providerName, models }]) => ({
      providerId,
      providerName,
      models: q
        ? models.filter(
            (model) =>
              model.model_name.toLowerCase().includes(q) ||
              model.model_id.toLowerCase().includes(q) ||
              providerName.toLowerCase().includes(q),
          )
        : models,
    }))
    .filter((g) => g.models.length > 0);

  return (
    <>
      <ListHeader
        icon={Sparkles}
        title="Pick an LLM model"
        search={search}
        setSearch={setSearch}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <LocalServerSection
          m={m}
          query={q}
          defaultLlm={defaultLlm}
          onClose={onClose}
        />
        {groups.map(({ providerId, providerName, models }) => (
          <div key={providerId}>
            <ProviderModelHeader
              providerId={providerId}
              providerName={providerName}
              hasKey={m.keyProviders.has(providerId)}
            />
            {models.map((model, index) => (
              <LlmModelRow
                key={model.model_id}
                name={model.model_name}
                providerName={providerName}
                modelId={model.model_id}
                selected={
                  defaultLlm?.model_id === model.model_id &&
                  defaultLlm?.provider === model.provider_id
                }
                hasKey={m.keyProviders.has(providerId)}
                first={index === 0}
                onSelect={() => onPickCloud(model)}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function LocalServerSection({
  m,
  query,
  defaultLlm,
  onClose,
}: {
  m: UseModels;
  query: string;
  defaultLlm: ConfiguredModel | undefined;
  onClose: () => void;
}): React.JSX.Element {
  const [showKey, setShowKey] = useState(false);
  const { localLlm } = m;

  const names = new Set(localLlm.models);
  if (defaultLlm?.provider === "local-llm") {
    names.add(defaultLlm.model_id.replace(/^local-llm\//, ""));
  }
  const list = [...names].filter(
    (n) => !query || n.toLowerCase().includes(query),
  );

  return (
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
        onSubmit={(e) => {
          e.preventDefault();
          void localLlm.test();
        }}
        className="border-border space-y-2.5 border-b px-5 py-3.5"
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

      {list.length === 0 ? (
        <div className="text-muted-foreground border-border border-b px-5 py-3 text-[12px]">
          No local models yet — test a connection to list them.
        </div>
      ) : (
        list.map((name) => {
          const modelId = `local-llm/${name}`;
          return (
            <LlmModelRow
              key={name}
              name={name}
              providerName="On-device"
              modelId={modelId}
              selected={
                defaultLlm?.provider === "local-llm" &&
                defaultLlm?.model_id === modelId
              }
              hasKey
              first={false}
              onSelect={() => void m.selectLocalLlmModel(name).then(onClose)}
            />
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key step
// ---------------------------------------------------------------------------

function KeyStep({
  provider,
  modelName,
  canGoBack,
  saving,
  error,
  onBack,
  onClose,
  onSave,
}: {
  provider: string;
  modelName?: string;
  canGoBack: boolean;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onClose: () => void;
  onSave: (key: string) => void;
}): React.JSX.Element {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const providerLabel = displayName(provider);

  return (
    <div className="p-7">
      <div className="mb-4 flex items-start gap-3.5">
        <div className="bg-accent/60 border-primary/20 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border">
          <Key className="text-accent-foreground h-[18px] w-[18px]" />
        </div>
        <div className="flex-1">
          <h3 className="text-foreground m-0 text-[17px] font-semibold">
            Add your {providerLabel} API key
          </h3>
          <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
            {modelName ? (
              <>
                <span className="text-foreground/80 font-medium">
                  {modelName}
                </span>{" "}
                needs a {providerLabel} key to run.
              </>
            ) : (
              <>Enter a new API key for {providerLabel}.</>
            )}
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

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSave(value.trim());
        }}
      >
        <div className="relative">
          <Key className="text-muted-foreground absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk-…"
            // biome-ignore lint/a11y/noAutofocus: focus the key field when the step opens
            autoFocus
            className={cn(
              "border-border bg-background mono w-full rounded-md border py-2.5 pl-9 pr-10 text-[13px]",
              error && "border-destructive",
            )}
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {error && (
          <div className="bg-destructive/10 flex items-start gap-2 rounded-md px-3 py-2">
            <AlertTriangle className="text-destructive mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="text-destructive text-xs">{error}</p>
          </div>
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
            onClick={canGoBack ? onBack : onClose}
            className="border-border hover:bg-secondary rounded-md border px-3.5 py-1.5 text-[12.5px]"
          >
            {canGoBack ? "Back" : "Cancel"}
          </button>
          <button
            type="submit"
            disabled={!value.trim() || saving}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-3.5 py-1.5 text-[12.5px] font-medium disabled:opacity-50"
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking…
              </span>
            ) : (
              "Save & use"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function Empty(): React.JSX.Element {
  return (
    <div className="text-muted-foreground px-5 py-10 text-center text-[13px]">
      No models match your search.
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfirmDialog — single reusable destructive confirm
// ---------------------------------------------------------------------------

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  onCancel,
  onConfirm,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(20,12,4,0.35)] p-6 backdrop-blur-[4px]"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="border-border bg-card w-full max-w-md rounded-[14px] border p-7 shadow-[0_24px_60px_-16px_rgba(20,12,4,0.4)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-foreground m-0 text-[17px] font-semibold">
          {title}
        </h3>
        <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
          {message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
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
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
