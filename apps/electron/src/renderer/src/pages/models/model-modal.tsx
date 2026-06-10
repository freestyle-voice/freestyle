import { type AvailableModel, PROVIDER_KEY_URLS } from "@renderer/lib/models";
import { cn } from "@renderer/lib/utils";
import { AlertTriangle, Eye, EyeOff, Key, Loader2, X } from "lucide-react";
import { useState } from "react";

import { ModelList } from "./model-list";
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
      <ModelList
        type={modal.type}
        m={m}
        onClose={onClose}
        onPickCloud={onPickCloud}
        onPickLocalVoice={onPickLocalVoice}
        onRequestDeleteLocal={onRequestDeleteLocal}
      />
    </Backdrop>
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
        <div className="flex items-center justify-between">
          <p
            className="mono text-muted-foreground text-[10px] uppercase"
            style={{ letterSpacing: "0.14em" }}
          >
            Stored in keychain · never logged
          </p>
          {PROVIDER_KEY_URLS[provider] && (
            <a
              href={PROVIDER_KEY_URLS[provider]}
              target="_blank"
              rel="noreferrer"
              className="text-primary text-[12px] underline underline-offset-2"
            >
              Get a {providerLabel} key ↗
            </a>
          )}
        </div>
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
