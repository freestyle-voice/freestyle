import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@renderer/components/ui/alert-dialog";
import { Button } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@renderer/components/ui/input-group";
import { type AvailableModel, PROVIDER_KEY_URLS } from "@renderer/lib/models";
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-label={label}
        showCloseButton={false}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
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
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close"
        >
          <X />
        </Button>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSave(value.trim());
        }}
      >
        <InputGroup>
          <InputGroupAddon>
            <Key />
          </InputGroupAddon>
          <InputGroupInput
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk-…"
            aria-invalid={!!error}
            autoFocus
            className="mono"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label={show ? "Hide API key" : "Show API key"}
              onClick={() => setShow(!show)}
            >
              {show ? <EyeOff /> : <Eye />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
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
          <Button
            variant="outline"
            size="sm"
            onClick={canGoBack ? onBack : onClose}
          >
            {canGoBack ? "Back" : "Cancel"}
          </Button>
          <Button
            type="submit"
            variant="ink"
            size="sm"
            disabled={!value.trim() || saving}
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking…
              </span>
            ) : (
              "Save & use"
            )}
          </Button>
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
    <AlertDialog open onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
