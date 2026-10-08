import { Button } from "@renderer/components/ui/button";
import { Skeleton } from "@renderer/components/ui/skeleton";
import { useCloudAuth } from "@renderer/lib/auth-context";
import type { AvailableModel } from "@renderer/lib/models";
import { cn, ON_DEVICE_PHRASE } from "@renderer/lib/utils";
import {
  CheckCircle,
  ChevronDown,
  Key,
  Loader2,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { FreestyleCloudBundleCard } from "./freestyle-cloud-bundle-card";
import { MlxWarmingDialog } from "./mlx-memory-section";
import { ConfirmDialog, type ModalState, ModelModal } from "./model-modal";
import {
  ModelsLoadingSkeleton,
  ModelsSettingsFrame,
  ModelsSettingsHeader,
} from "./models-page-layout";
import { PageShell } from "./page-chrome";
import { PairCard } from "./pair-card";
import { RemixModelCard } from "./remix-model-card";
import {
  FREESTYLE_CLOUD_CLEANUP,
  FREESTYLE_CLOUD_TIER,
} from "./transcription-picker";
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [choosingForRemix] = useState(searchParams.get("choose") === "remix");
  useEffect(() => {
    if (m.loading || searchParams.get("choose") !== "remix") return;
    setModal({ kind: "list", type: "remix" });
    const next = new URLSearchParams(searchParams);
    next.delete("choose");
    setSearchParams(next, { replace: true });
  }, [m.loading, searchParams, setSearchParams]);
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
  // Refetch only when the signed-in user actually changes, so the sign-in
  // switch to Freestyle Transcribe (and the sign-out revert) is reflected. The
  // initial mount is skipped — the queries already load themselves, so reloading
  // here would just refetch the same data a second time.
  const prevCloudUserId = useRef<string | null>(cloudUserId);
  useEffect(() => {
    if (prevCloudUserId.current === cloudUserId) return;
    prevCloudUserId.current = cloudUserId;
    void reloadModels(true).catch((error) => {
      console.error("Failed to refresh model preferences:", error);
    });
  }, [cloudUserId, reloadModels]);

  // Keep Freestyle Cleanup paired with Freestyle Transcribe. Wait for the
  // persisted settings to seed into `m.llmCleanup` first — reading it before
  // then sees the initial `false` and re-configures cleanup on every mount.
  useEffect(() => {
    if (
      m.loading ||
      !m.settingsSeeded ||
      !freestyleVoiceActive ||
      syncingFreestyleCleanup.current
    ) {
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
    m.settingsSeeded,
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

  const finishSelection = (type: string | null): void => {
    closeModal();
    if (type === "remix" && choosingForRemix) navigate("/remix");
  };

  const ensureCloudAuth = async (): Promise<boolean> => {
    if (cloudAuth.user && (await cloudAuth.refresh())) return true;
    return !!(await cloudAuth.signIn());
  };

  const configureFreestylePair = async (): Promise<void> => {
    setCloudBusy(true);
    try {
      if (!(await ensureCloudAuth())) return;
      await m.configureModel(FREESTYLE_CLOUD_TIER, "voice");
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

  const openRemix = (): void => setModal({ kind: "list", type: "remix" });

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

    if (type === "llm" && freestyleVoiceActive) return;

    if (
      type === "llm" &&
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
        finishSelection(type);
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
    void m.configureModel(model, type).then(() => finishSelection(type));
  };

  const onPickLocalVoice = (
    defId: string,
    name: string,
    engine?: "whisper" | "mlx",
  ): void => {
    void m.selectLocalVoice(defId, name, engine).then((selected) => {
      if (selected && modal?.kind === "list") closeModal();
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
    } else if (modal.type === "remix") {
      setModal({ kind: "list", type: "remix" });
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
      finishSelection(type);
    })();
  };

  const showMlxWarming = m.defaultVoice?.provider === "local-mlx";

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (m.loading) {
    return (
      <PageShell>
        <ModelsSettingsFrame>
          <ModelsSettingsHeader
            title={t("models.title")}
            subtitle={t("models.subtitle")}
          />
          <ModelsLoadingSkeleton />
        </ModelsSettingsFrame>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <ModelsSettingsFrame>
        <ModelsSettingsHeader
          title={t("models.title")}
          subtitle={t("models.subtitle")}
        />
        <div className="space-y-5">
          <div className="@container border-border bg-card/55 overflow-hidden rounded-[12px] border">
            <section aria-label="Dictation models">
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
            </section>
            <section aria-label="Remix model">
              <RemixModelCard
                model={m.defaultRemix}
                signedIn={!!cloudAuth.user}
                onChooseModel={openRemix}
              />
            </section>
            <FreestyleCloudBundleCard
              active={
                freestyleVoiceActive &&
                m.llmCleanup &&
                m.defaultLlm?.provider === FREESTYLE_CLOUD_PROVIDER &&
                m.defaultLlm?.model_id === FREESTYLE_CLOUD_CLEANUP.model_id
              }
              signedIn={!!cloudAuth.user}
              busy={cloudBusy}
              onUse={() => void configureFreestylePair()}
            />
          </div>

          <KeysSection
            apiKeys={m.apiKeys}
            configured={m.configured}
            deletingProviders={m.deletingProviders}
            loading={m.keysLoading}
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
            catalogLoading={m.catalogLoading}
            onClose={closeModal}
            onModelSelected={() =>
              finishSelection(modal.kind === "list" ? modal.type : null)
            }
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
                  m.defaultLlm?.provider === pendingProviderDelete ||
                  m.defaultRemix?.provider === pendingProviderDelete) &&
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
      </ModelsSettingsFrame>
    </PageShell>
  );
}

function SkeletonLine({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return <Skeleton className={cn("rounded-full", className)} />;
}

// ---------------------------------------------------------------------------
// KeysSection — compact list of stored provider keys (edit / remove)
// ---------------------------------------------------------------------------

function KeysSection({
  apiKeys,
  configured,
  deletingProviders,
  loading,
  onEdit,
  onDelete,
}: {
  apiKeys: ApiKeyEntry[];
  configured: ConfiguredModel[];
  deletingProviders: Set<string>;
  loading: boolean;
  onEdit: (provider: string) => void;
  onDelete: (provider: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <details
      className="group border-border overflow-hidden rounded-[12px] border"
      data-testid="models-api-keys"
    >
      <summary className="text-foreground flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          {t("models.apiKeys")}
          <span className="text-muted-foreground text-[12px]">
            {loading ? "…" : apiKeys.length}
          </span>
          {apiKeys.some((key) => key.status === "invalid") && (
            <span className="text-destructive text-[11px]">
              {t("models.overview.keyAttention", {
                defaultValue: "Needs attention",
              })}
            </span>
          )}
        </span>
        <ChevronDown
          className="text-muted-foreground size-4 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-border border-t">
        {loading ? (
          <div
            className="space-y-3 px-4 py-4 sm:px-5"
            role="status"
            aria-label="Loading API keys"
          >
            <SkeletonLine className="h-4 w-40" />
            <SkeletonLine className="h-3 w-28" />
          </div>
        ) : apiKeys.length === 0 ? (
          <p className="text-muted-foreground px-4 py-4 text-[13px] sm:px-5">
            {t("models.apiKeysHint")}
          </p>
        ) : (
          apiKeys.map((entry, i) => (
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
          ))
        )}
      </div>
    </details>
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
        "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:flex-nowrap sm:px-5",
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
      <span className="text-muted-foreground order-3 w-full text-[11.5px] sm:order-none sm:w-auto">
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
