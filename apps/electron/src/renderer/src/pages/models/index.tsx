import { Button } from "@renderer/components/ui/button";
import { useCloudAuth } from "@renderer/lib/auth-context";
import type { AvailableModel } from "@renderer/lib/models";
import { cn, ON_DEVICE_PHRASE } from "@renderer/lib/utils";
import {
  CheckCircle,
  Key,
  Laptop,
  Loader2,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { FREESTYLE_CLOUD_CLEANUP } from "./cleanup-picker";
import { MlxWarmingDialog } from "./mlx-memory-section";
import { ConfirmDialog, type ModalState, ModelModal } from "./model-modal";
import { Eyebrow, PageHeader, PageShell } from "./page-chrome";
import { PairCard } from "./pair-card";
import type { ApiKeyEntry, ConfiguredModel } from "./types";
import { useModels } from "./use-models";
import { displayName } from "./utils";

/**
 * Managed provider that needs no key. It can handle transcription, cleanup, or
 * both, depending on which sides the user routes to it.
 */
const FREESTYLE_CLOUD_PROVIDER = "freestyle-cloud";

export default function ModelsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const m = useModels();
  const cloudAuth = useCloudAuth();

  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);

  const [pendingLocalDelete, setPendingLocalDelete] = useState<{
    defId: string;
    engine?: "whisper" | "mlx";
    name: string;
  } | null>(null);
  const [pendingProviderDelete, setPendingProviderDelete] = useState<
    string | null
  >(null);
  const [warmingOpen, setWarmingOpen] = useState(false);

  const freestyleVoiceActive =
    m.defaultVoice?.provider === FREESTYLE_CLOUD_PROVIDER;
  const syncingFreestyleCleanup = useRef(false);

  const cloudUserId = cloudAuth.user?.id ?? null;
  const reloadModels = m.reload;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when the signed-in user changes so the sign-in switch to Freestyle Transcribe (and the sign-out revert) is reflected.
  useEffect(() => {
    void reloadModels();
  }, [cloudUserId, reloadModels]);

  // Keep Freestyle Cleanup paired with Freestyle Transcribe.
  useEffect(() => {
    if (m.loading || !freestyleVoiceActive || syncingFreestyleCleanup.current) {
      return;
    }
    const needsSync =
      !m.llmCleanup ||
      m.defaultLlm?.provider !== FREESTYLE_CLOUD_PROVIDER ||
      m.defaultLlm?.model_id !== FREESTYLE_CLOUD_CLEANUP.model_id;
    if (!needsSync) return;

    syncingFreestyleCleanup.current = true;
    void (async () => {
      try {
        if (cloudAuth.user && (await cloudAuth.refresh())) {
          setCloudBusy(true);
          await m.configureModel(FREESTYLE_CLOUD_CLEANUP, "llm");
          m.setCleanup(true);
        }
      } finally {
        setCloudBusy(false);
        syncingFreestyleCleanup.current = false;
      }
    })();
  }, [
    m.loading,
    freestyleVoiceActive,
    m.llmCleanup,
    m.defaultLlm?.provider,
    m.defaultLlm?.model_id,
    m.configureModel,
    m.setCleanup,
    cloudAuth,
  ]);

  // -------------------------------------------------------------------------
  // Modal flow
  // -------------------------------------------------------------------------

  const closeModal = (): void => {
    setModal(null);
    setKeyError(null);
    setSaving(false);
  };

  const ensureCloudAuth = async (): Promise<boolean> => {
    if (cloudAuth.user && (await cloudAuth.refresh())) return true;
    return !!(await cloudAuth.signIn());
  };

  const configureFreestylePair = async (): Promise<void> => {
    setCloudBusy(true);
    try {
      if (!(await ensureCloudAuth())) return;
      await m.configureModel(
        {
          provider_id: FREESTYLE_CLOUD_PROVIDER,
          provider_name: "Freestyle Transcribe",
          model_id: "freestyle-cloud/stt",
          model_name: "Freestyle Transcribe (Managed)",
          type: "voice",
        },
        "voice",
      );
      await m.configureModel(FREESTYLE_CLOUD_CLEANUP, "llm");
      m.setCleanup(true);
    } finally {
      setCloudBusy(false);
    }
  };

  const configureVoice = (
    model: AvailableModel,
    { closeAfter = false }: { closeAfter?: boolean } = {},
  ): void => {
    if (model.provider_id === FREESTYLE_CLOUD_PROVIDER) {
      void configureFreestylePair().then(() => {
        if (closeAfter) closeModal();
      });
      return;
    }

    const needsKey =
      model.provider_id !== "local-llm" &&
      model.provider_id !== FREESTYLE_CLOUD_PROVIDER &&
      !m.keyProviders.has(model.provider_id);
    if (needsKey) {
      setKeyError(null);
      setModal({
        kind: "key",
        type: "voice",
        provider: model.provider_id,
        modelName: model.model_name,
        pendingModel: model,
      });
      return;
    }
    void m.configureModel(model, "voice").then(() => {
      if (closeAfter) closeModal();
    });
  };

  const openVoice = (): void =>
    setModal({ kind: "list", type: "voice", voiceView: "tiers" });

  const openLlm = (): void => {
    if (freestyleVoiceActive) return;
    m.setCleanup(true);
    setModal({ kind: "list", type: "llm", llmView: "tiers" });
  };

  const onToggleCleanup = (next: boolean): void => {
    if (freestyleVoiceActive) return;
    if (!next) {
      m.setCleanup(false);
      return;
    }
    m.setCleanup(true);
    if (!m.defaultLlm) {
      openLlm();
    }
  };

  const onPickCloud = (model: AvailableModel): void => {
    if (modal?.kind !== "list") return;
    const type = modal.type;

    if (type === "voice") {
      configureVoice(model, { closeAfter: true });
      return;
    }

    if (freestyleVoiceActive) return;

    if (
      model.provider_id === FREESTYLE_CLOUD_PROVIDER &&
      model.model_id === FREESTYLE_CLOUD_CLEANUP.model_id
    ) {
      return;
    }

    if (model.provider_id === FREESTYLE_CLOUD_PROVIDER) {
      void (async () => {
        setCloudBusy(true);
        try {
          if (!(await ensureCloudAuth())) return;
          await m.configureModel(model, type);
        } finally {
          setCloudBusy(false);
        }
        closeModal();
      })();
      return;
    }

    const needsKey =
      model.provider_id !== "local-llm" &&
      model.provider_id !== FREESTYLE_CLOUD_PROVIDER &&
      !m.keyProviders.has(model.provider_id);
    if (needsKey) {
      setKeyError(null);
      setModal({
        kind: "key",
        type,
        provider: model.provider_id,
        modelName: model.model_name,
        pendingModel: model,
      });
      return;
    }
    void m.configureModel(model, type).then(closeModal);
  };

  const onPickLocalVoice = (
    defId: string,
    name: string,
    engine?: "whisper" | "mlx",
  ): void => {
    void m.selectLocalVoice(defId, name, engine).then(() => {
      if (modal?.kind === "list") closeModal();
    });
  };

  const onRequestDeleteLocal = (
    defId: string,
    engine?: "whisper" | "mlx",
  ): void => {
    const item = m.voiceItems.find(
      (row) => row.defId === defId && row.localEngine === engine,
    );
    setPendingLocalDelete({ defId, engine, name: item?.name ?? defId });
  };

  const onBack = (): void => {
    if (modal?.kind !== "key") return;
    if (modal.type === "voice") {
      setModal({ kind: "list", type: "voice", voiceView: "tiers" });
    } else if (modal.type === "llm") {
      setModal({ kind: "list", type: "llm", llmView: "tiers" });
    } else {
      closeModal();
    }
  };

  const onSaveKey = (key: string): void => {
    if (modal?.kind !== "key") return;
    const { provider, pendingModel, type } = modal;
    setSaving(true);
    setKeyError(null);
    void (async () => {
      const err = await m.saveKey(provider, key);
      if (err) {
        setKeyError(err);
        setSaving(false);
        return;
      }
      if (pendingModel && type) {
        if (
          type === "voice" &&
          pendingModel.provider_id === FREESTYLE_CLOUD_PROVIDER
        ) {
          await configureFreestylePair();
        } else {
          await m.configureModel(pendingModel, type);
        }
      }
      closeModal();
    })();
  };

  const hasLocalVoice = m.configured.some(
    (c) => c.provider === "local-whisper" || c.provider === "local-mlx",
  );
  const showMlxWarming = m.defaultVoice?.provider === "local-mlx";

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (m.loading) {
    return (
      <PageShell>
        <PageHeader title={t("models.title")} />
        <ModelsLoadingSkeleton />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader title={t("models.title")} />
      <div className="space-y-6">
        <PairCard
          voice={m.defaultVoice}
          llm={m.defaultLlm}
          llmCleanup={m.llmCleanup}
          cleanupLocked={freestyleVoiceActive}
          onToggleCleanup={onToggleCleanup}
          onChangeVoice={openVoice}
          onChangeLlm={openLlm}
          onConfigureWarming={
            showMlxWarming ? () => setWarmingOpen(true) : undefined
          }
        />

        <KeysSection
          apiKeys={m.apiKeys}
          configured={m.configured}
          deletingProviders={m.deletingProviders}
          showLocal={hasLocalVoice}
          onEdit={(provider) =>
            setModal({
              kind: "key",
              type: null,
              provider,
              pendingModel: null,
            })
          }
          onDelete={setPendingProviderDelete}
        />
      </div>

      {warmingOpen && (
        <MlxWarmingDialog
          keepAliveMinutes={m.mlxKeepAliveMinutes}
          blockedReason={m.mlxStatus?.blockedReason ?? null}
          onChange={m.saveMlxKeepAliveMinutes}
          onClose={() => setWarmingOpen(false)}
        />
      )}

      {modal && (
        <ModelModal
          modal={modal}
          m={m}
          saving={saving}
          keyError={keyError}
          cloudBusy={cloudBusy}
          onClose={closeModal}
          onPickCloud={onPickCloud}
          onPickLocalVoice={onPickLocalVoice}
          onRequestDeleteLocal={onRequestDeleteLocal}
          onBack={onBack}
          onSaveKey={onSaveKey}
        />
      )}

      {pendingLocalDelete && (
        <ConfirmDialog
          title={t("models.deleteLocalTitle")}
          message={
            <Trans
              i18nKey="models.deleteLocalMsg"
              values={{
                name: pendingLocalDelete.name,
                phrase: ON_DEVICE_PHRASE,
              }}
              components={{
                b: <span className="text-foreground/80 font-medium" />,
              }}
            />
          }
          onCancel={() => setPendingLocalDelete(null)}
          onConfirm={() => {
            const { defId, engine } = pendingLocalDelete;
            setPendingLocalDelete(null);
            void m.deleteLocal(defId, engine);
          }}
        />
      )}

      {pendingProviderDelete && (
        <ConfirmDialog
          title={t("models.deleteProviderTitle")}
          message={
            <>
              <Trans
                i18nKey="models.deleteProviderMsgBase"
                values={{ provider: displayName(pendingProviderDelete) }}
                components={{
                  b: <span className="text-foreground/80 font-medium" />,
                }}
              />
              {(m.defaultVoice?.provider === pendingProviderDelete ||
                m.defaultLlm?.provider === pendingProviderDelete) &&
                t("models.deleteProviderCurrentSuffix")}
              .
            </>
          }
          onCancel={() => setPendingProviderDelete(null)}
          onConfirm={() => {
            const provider = pendingProviderDelete;
            setPendingProviderDelete(null);
            void m.deleteProvider(provider);
          }}
        />
      )}
    </PageShell>
  );
}

function SkeletonLine({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "bg-muted/60 relative overflow-hidden rounded-full",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent",
        className,
      )}
    />
  );
}

function ModelsLoadingSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6" role="status" aria-label="Loading models">
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
      <section className="border-border bg-card grid grid-cols-1 gap-6 rounded-[14px] border p-6 min-[820px]:grid-cols-2">
        {["voice", "cleanup"].map((key) => (
          <div
            key={key}
            className={cn(
              "flex min-h-[140px] flex-col gap-3",
              key === "cleanup" &&
                "border-border border-t pt-6 min-[820px]:border-l min-[820px]:border-t-0 min-[820px]:pl-6 min-[820px]:pt-0",
            )}
          >
            <SkeletonLine className="h-3 w-40" />
            <SkeletonLine className="h-6 w-52 max-w-full" />
            <SkeletonLine className="h-3 w-32" />
            <div className="mt-auto flex items-center gap-3">
              <SkeletonLine className="h-9 w-24 rounded-md" />
              <SkeletonLine className="h-5 w-28" />
            </div>
          </div>
        ))}
      </section>

      <section>
        <SkeletonLine className="h-3 w-28" />
        <div className="border-border bg-card mt-3 overflow-hidden rounded-[12px] border">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={cn(
                "flex items-center justify-between gap-4 px-[18px] py-[13px]",
                i > 0 && "border-border border-t",
              )}
            >
              <SkeletonLine className="h-4 w-40" />
              <SkeletonLine className="h-8 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KeysSection — compact list of stored provider keys (edit / remove)
// ---------------------------------------------------------------------------

function KeysSection({
  apiKeys,
  configured,
  deletingProviders,
  showLocal,
  onEdit,
  onDelete,
}: {
  apiKeys: ApiKeyEntry[];
  configured: ConfiguredModel[];
  deletingProviders: Set<string>;
  showLocal: boolean;
  onEdit: (provider: string) => void;
  onDelete: (provider: string) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (apiKeys.length === 0 && !showLocal) {
    return (
      <p className="text-muted-foreground text-[13px]">
        {t("models.noApiKeys")}
      </p>
    );
  }

  return (
    <section>
      <div className="mb-3">
        <Eyebrow text={t("models.apiKeys")} />
      </div>
      <div className="border-border bg-card overflow-hidden rounded-[12px] border">
        {apiKeys.map((entry, i) => (
          <KeyRow
            key={entry.provider}
            entry={entry}
            count={
              configured.filter((c) => c.provider === entry.provider).length
            }
            first={i === 0}
            deleting={deletingProviders.has(entry.provider)}
            onEdit={() => onEdit(entry.provider)}
            onDelete={() => onDelete(entry.provider)}
          />
        ))}
        {showLocal && (
          <div
            className={cn(
              "flex items-center gap-3 px-[18px] py-[13px]",
              apiKeys.length > 0 && "border-border border-t",
            )}
          >
            <Laptop className="text-primary h-[15px] w-[15px] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-foreground text-[13.5px] font-semibold">
                {t("models.onDevice")}
              </div>
              <div className="mono text-muted-foreground mt-0.5 text-[11px]">
                {t("models.onDeviceNoKey")}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function KeyRow({
  entry,
  count,
  first,
  deleting,
  onEdit,
  onDelete,
}: {
  entry: ApiKeyEntry;
  count: number;
  first: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const invalid = entry.status === "invalid";
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-[18px] py-[13px]",
        !first && "border-border border-t",
      )}
    >
      <Key className="text-muted-foreground h-[15px] w-[15px] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-foreground text-[13.5px] font-semibold">
            {displayName(entry.provider)}
          </span>
          {entry.status === "valid" && (
            <CheckCircle className="text-primary h-3.5 w-3.5 shrink-0" />
          )}
          {invalid && (
            <XCircle className="text-destructive h-3.5 w-3.5 shrink-0" />
          )}
        </div>
        <div className="mono text-muted-foreground mt-0.5 text-[11px]">
          {invalid ? (
            <span className="text-destructive">{t("models.keyInvalid")}</span>
          ) : entry.hint ? (
            t("models.keyStoredWithHint", { hint: entry.hint })
          ) : (
            t("models.keyStored")
          )}
        </div>
      </div>
      <span className="text-muted-foreground text-[11.5px]">
        {count}{" "}
        {count === 1 ? t("models.modelSingular") : t("models.modelPlural")}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          disabled={deleting}
          className="text-muted-foreground hover:text-foreground"
          aria-label={t("models.keyUpdate")}
          title={t("models.keyUpdate")}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          disabled={deleting}
          className="text-muted-foreground hover:text-destructive"
          aria-label={t("models.keyDelete")}
          title={t("models.keyDelete")}
        >
          {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </div>
    </div>
  );
}
