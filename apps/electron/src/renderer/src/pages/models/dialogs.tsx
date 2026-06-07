import type { ApiKeyInput } from "@freestyle/validations";
import type { AvailableModel } from "@renderer/lib/models";
import { cn } from "@renderer/lib/utils";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import type { useForm } from "react-hook-form";

import { displayName } from "./utils";

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

export function ApiKeyDialog({
  model,
  provider,
  form,
  show,
  setShow,
  onClose,
  onSubmit,
  validating,
  validationError,
}: {
  model: AvailableModel;
  provider: string;
  form: ReturnType<typeof useForm<ApiKeyInput>>;
  show: boolean;
  setShow: (v: boolean) => void;
  onClose: () => void;
  onSubmit: (data: ApiKeyInput) => Promise<void>;
  validating?: boolean;
  validationError?: string | null;
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
              (form.formState.errors.key || validationError) &&
                "border-destructive",
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
        {validationError && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2">
            <AlertTriangle className="text-destructive mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="text-destructive text-xs">{validationError}</p>
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
            onClick={onClose}
            className="border-border hover:bg-secondary rounded-md border px-3.5 py-1.5 text-[12.5px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!form.formState.isValid || validating}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-3.5 py-1.5 text-[12.5px] font-medium disabled:opacity-50"
          >
            {validating ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking…
              </span>
            ) : (
              "Save & continue"
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function EditKeyDialog({
  provider,
  value,
  setValue,
  show,
  setShow,
  onClose,
  onSave,
  validating,
  validationError,
}: {
  provider: string;
  value: string;
  setValue: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  validating?: boolean;
  validationError?: string | null;
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
            className={cn(
              "border-border bg-background mono w-full rounded-md border py-2.5 pl-9 pr-10 text-[13px]",
              validationError && "border-destructive",
            )}
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
        {validationError && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2">
            <AlertTriangle className="text-destructive mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="text-destructive text-xs">{validationError}</p>
          </div>
        )}
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
            disabled={!value.trim() || validating}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-3.5 py-1.5 text-[12.5px] font-medium disabled:opacity-50"
          >
            {validating ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking…
              </span>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function LocalModelDeleteDialog({
  name,
  engine,
  onClose,
  onConfirm,
}: {
  name: string;
  engine: "whisper" | "mlx";
  onClose: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  const engineLabel = engine === "mlx" ? "MLX" : "Whisper";
  return (
    <ModalShell>
      <div className="mb-4">
        <h3 className="text-foreground m-0 text-[17px] font-semibold">
          Delete local model?
        </h3>
        <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
          Remove <span className="text-foreground/80 font-medium">{name}</span>{" "}
          from this Mac. {engineLabel} weights are deleted from your local
          cache; you can download them again later.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
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
    </ModalShell>
  );
}

export function DeleteDialog({
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
