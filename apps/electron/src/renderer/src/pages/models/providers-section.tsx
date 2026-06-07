import { cn } from "@renderer/lib/utils";
import {
  CheckCircle,
  ChevronRight,
  Cpu,
  Key,
  Laptop,
  Pencil,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";

import { RECOMMENDED_PROVIDERS } from "./constants";
import { Eyebrow } from "./page-chrome";
import type { ApiKeyEntry, ConfiguredModel } from "./types";
import { displayName } from "./utils";

// ---------------------------------------------------------------------------
// ProvidersSection — providers & keys as a single list (on-device included)
// ---------------------------------------------------------------------------

export function ProvidersSection({
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
            status={entry.status ?? "unknown"}
            first={i === 0}
            onEdit={() => onEdit(entry.provider)}
            onDelete={() => onDelete(entry.provider)}
          />
        ))}
        {showLocalProvider && (
          <LocalProviderRow
            first={apiKeys.length === 0}
            modelCount={
              configured.filter(
                (m) =>
                  m.provider === "local-whisper" || m.provider === "local-mlx",
              ).length
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
  status,
  first,
  onEdit,
  onDelete,
}: {
  providerId: string;
  configured: ConfiguredModel[];
  status: "valid" | "invalid" | "unknown";
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
        <div className="flex items-center gap-1.5">
          <span className="text-foreground text-[13.5px] font-semibold">
            {displayName(providerId)}
          </span>
          {status === "valid" && (
            <CheckCircle className="text-primary h-3.5 w-3.5 shrink-0" />
          )}
          {status === "invalid" && (
            <XCircle className="text-destructive h-3.5 w-3.5 shrink-0" />
          )}
        </div>
        <div className="mono text-muted-foreground mt-0.5 text-[11px]">
          {status === "invalid" ? (
            <span className="text-destructive">
              Key invalid — update or delete
            </span>
          ) : (
            "Key stored in keychain"
          )}
        </div>
      </div>
      <span className="text-muted-foreground text-[11.5px]">
        {count} model{count === 1 ? "" : "s"}
      </span>
      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5 transition-opacity",
          status === "invalid"
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100",
        )}
      >
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
          On-device
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
