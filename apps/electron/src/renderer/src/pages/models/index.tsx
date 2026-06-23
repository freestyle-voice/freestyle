import { Button } from "@renderer/components/ui/button";
import { getClient } from "@renderer/lib/api";
import { useCloudAuth } from "@renderer/lib/auth-context";
import type { AvailableModel } from "@renderer/lib/models";
import { cn, ON_DEVICE_PHRASE } from "@renderer/lib/utils";
import {
  CheckCircle,
  ChevronDown,
  Cloud,
  Key,
  Laptop,
  Mic,
  Pencil,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { SETTINGS_KEYS } from "../../../../shared/settings-keys";

import { CleanupIntensityCard } from "./cleanup-intensity";
import { MlxWarmingDialog } from "./mlx-memory-section";
import { ConfirmDialog, type ModalState, ModelModal } from "./model-modal";
import { Eyebrow, PageHeader, PageShell } from "./page-chrome";
import { PairCard } from "./pair-card";
import type { ApiKeyEntry, ConfiguredModel } from "./types";
import { useModels } from "./use-models";
import { displayName } from "./utils";

/** Managed STT provider that needs no key and runs its own cleanup. */
const FREESTYLE_CLOUD_PROVIDER = "freestyle-cloud";

export default function ModelsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const m = useModels();
  const cloudAuth = useCloudAuth();

  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const [pendingLocalDelete, setPendingLocalDelete] = useState<{
    defId: string;
    engine?: "whisper" | "mlx";
    name: string;
  } | null>(null);
  const [pendingProviderDelete, setPendingProviderDelete] = useState<
    string | null
  >(null);
  const [warmingOpen, setWarmingOpen] = useState(false);
  const [cloudPanelExpanded, setCloudPanelExpanded] = useState(true);

  // -------------------------------------------------------------------------
  // Modal flow
  // -------------------------------------------------------------------------

  const closeModal = (): void => {
    setModal(null);
    setKeyError(null);
    setSaving(false);
  };

  const freestyleVoice = m.available.find(
    (model) =>
      model.type === "voice" && model.provider_id === FREESTYLE_CLOUD_PROVIDER,
  );
  const freestyleCleanup = m.available.find(
    (model) =>
      model.type === "llm" && model.provider_id === FREESTYLE_CLOUD_PROVIDER,
  );
  const cloudVoiceActive =
    m.defaultVoice?.provider === FREESTYLE_CLOUD_PROVIDER;
  const cloudCleanupActive =
    m.llmCleanup && m.defaultLlm?.provider === FREESTYLE_CLOUD_PROVIDER;

  const fallbackLocalVoice = m.voiceItems.find(
    (item) => item.kind === "local" && item.status === "ready" && item.defId,
  );

  const ensureCloudAuth = async (): Promise<boolean> => {
    if (cloudAuth.user && (await cloudAuth.refresh())) return true;
    return !!(await cloudAuth.signIn());
  };

  const useFreestyleCloudForBoth = (): void => {
    if (!freestyleVoice || !freestyleCleanup) return;
    void (async () => {
      if (!(await ensureCloudAuth())) return;
      await m.configureModel(freestyleVoice, "voice");
      await m.configureModel(freestyleCleanup, "llm");
      m.setCleanup(true);
    })();
  };

  const useFreestyleCloudForTranscription = (): void => {
    if (!freestyleVoice) return;
    void (async () => {
      if (!(await ensureCloudAuth())) return;
      await m.configureModel(freestyleVoice, "voice");
      if (cloudCleanupActive) m.setCleanup(false);
    })();
  };

  const useFreestyleCloudForCleanup = (): void => {
    if (!freestyleCleanup) return;
    void (async () => {
      if (!(await ensureCloudAuth())) return;
      if (cloudVoiceActive && fallbackLocalVoice?.defId) {
        await m.selectLocalVoice(
          fallbackLocalVoice.defId,
          fallbackLocalVoice.name,
          fallbackLocalVoice.localEngine,
        );
      }
      await m.configureModel(freestyleCleanup, "llm");
      m.setCleanup(true);
    })();
  };

  const openVoice = (): void => setModal({ kind: "list", type: "voice" });
  const openLlm = (): void => {
    m.setCleanup(true);
    setModal({ kind: "list", type: "llm" });
  };

  const onPickCloud = (model: AvailableModel): void => {
    if (modal?.kind !== "list") return;
    const type = modal.type;

    // Freestyle Cloud requires a fresh signed-in server session.
    if (model.provider_id === FREESTYLE_CLOUD_PROVIDER) {
      void (async () => {
        if (!(await ensureCloudAuth())) return;
        await m.configureModel(model, type);
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
    void m.selectLocalVoice(defId, name, engine).then(closeModal);
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
    if (modal.type) setModal({ kind: "list", type: modal.type });
    else closeModal();
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
        await m.configureModel(pendingModel, type);
      }
      closeModal();
    })();
  };

  const hasLocalVoice = m.configured.some(
    (c) => c.provider === "local-whisper" || c.provider === "local-mlx",
  );
  // Only the all-in-one route owns cleanup. Cloud transcription can still feed
  // a custom cleanup model.
  const cleanupLocked = cloudVoiceActive && cloudCleanupActive;
  // Model warming only applies to the active local MLX worker.
  const showMlxWarming = m.defaultVoice?.provider === "local-mlx";

  useEffect(() => {
    getClient()
      .api.settings[":key"].$get({
        param: { key: SETTINGS_KEYS.freestyleCloudPanelExpanded },
      })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if ("value" in data) setCloudPanelExpanded(data.value !== "false");
      })
      .catch(() => {});
  }, []);

  const toggleCloudPanel = (): void => {
    setCloudPanelExpanded((current) => {
      const next = !current;
      getClient()
        .api.settings[":key"].$put({
          param: { key: SETTINGS_KEYS.freestyleCloudPanelExpanded },
          json: { value: String(next) },
        })
        .catch(() => {});
      return next;
    });
  };

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
        <FreestyleCloudModeCard
          signedIn={!!cloudAuth.user}
          voiceActive={cloudVoiceActive}
          cleanupActive={cloudCleanupActive}
          expanded={cloudPanelExpanded}
          onSignIn={() => void cloudAuth.signIn()}
          onToggleExpanded={toggleCloudPanel}
          onUseTranscription={useFreestyleCloudForTranscription}
          onUseBoth={useFreestyleCloudForBoth}
          onUseCleanup={useFreestyleCloudForCleanup}
          canUse={!!freestyleVoice && !!freestyleCleanup}
          cleanupDisabled={cloudVoiceActive && !fallbackLocalVoice}
        />
        <PairCard
          voice={m.defaultVoice}
          llm={m.defaultLlm}
          llmCleanup={m.llmCleanup}
          onToggleCleanup={m.setCleanup}
          onChangeVoice={openVoice}
          onChangeLlm={openLlm}
          onConfigureWarming={
            showMlxWarming ? () => setWarmingOpen(true) : undefined
          }
          cleanupDisabled={cleanupLocked}
        />

        {m.llmCleanup && !cleanupLocked && (
          <CleanupIntensityCard
            intensity={m.cleanupIntensity}
            customPrompt={m.cleanupCustomPrompt}
            customPromptDirty={m.customPromptDirty}
            savingCustomPrompt={m.savingCustomPrompt}
            onIntensityChange={m.setCleanupIntensity}
            onCustomPromptChange={m.setCleanupCustomPrompt}
            onSaveCustomPrompt={m.saveCleanupCustomPrompt}
          />
        )}

        <KeysSection
          apiKeys={m.apiKeys}
          configured={m.configured}
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

      <section className="border-border bg-card rounded-[14px] border p-5">
        <div className="flex flex-col gap-4 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
          <div className="min-w-0 flex-1">
            <SkeletonLine className="h-3 w-28" />
            <SkeletonLine className="mt-3 h-5 w-64 max-w-full" />
            <SkeletonLine className="mt-3 h-3 w-full max-w-[560px]" />
            <SkeletonLine className="mt-2 h-3 w-4/5 max-w-[460px]" />
            <div className="mt-4 flex flex-wrap gap-2">
              <SkeletonLine className="h-7 w-28" />
              <SkeletonLine className="h-7 w-24" />
              <SkeletonLine className="h-7 w-36" />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <SkeletonLine className="h-9 w-20 rounded-md" />
            <SkeletonLine className="h-9 w-32 rounded-md" />
            <SkeletonLine className="h-9 w-28 rounded-md" />
          </div>
        </div>
      </section>

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

      <section className="border-border bg-card rounded-[14px] border p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <SkeletonLine className="h-3 w-28" />
            <SkeletonLine className="mt-3 h-5 w-44" />
            <SkeletonLine className="mt-3 h-3 w-full max-w-[420px]" />
          </div>
          <SkeletonLine className="h-8 w-24 rounded-md" />
        </div>
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <SkeletonLine className="h-4 w-40" />
                <SkeletonLine className="mt-2 h-3 w-64 max-w-full" />
              </div>
              <SkeletonLine className="h-8 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FreestyleCloudModeCard({
  signedIn,
  voiceActive,
  cleanupActive,
  expanded,
  onSignIn,
  onToggleExpanded,
  onUseTranscription,
  onUseBoth,
  onUseCleanup,
  canUse,
  cleanupDisabled,
}: {
  signedIn: boolean;
  voiceActive: boolean;
  cleanupActive: boolean;
  expanded: boolean;
  onSignIn: () => void;
  onToggleExpanded: () => void;
  onUseTranscription: () => void;
  onUseBoth: () => void;
  onUseCleanup: () => void;
  canUse: boolean;
  cleanupDisabled: boolean;
}): React.JSX.Element {
  return (
    <section className="border-border bg-card overflow-hidden rounded-[14px] border">
      <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-4 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Cloud className="text-primary size-4" />
            <Eyebrow text="Freestyle Cloud" />
          </div>
          <p className="text-muted-foreground mt-1.5 max-w-[620px] text-[13px] leading-relaxed">
            Fast, managed transcription and cleanup from Freestyle. Use it for
            speech-to-text, polishing text, or both in one pass.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!signedIn && (
            <Button variant="outline" size="sm" onClick={onSignIn}>
              Sign in
            </Button>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onToggleExpanded}
            aria-label={
              expanded
                ? "Hide Freestyle Cloud options"
                : "Show Freestyle Cloud options"
            }
          >
            <ChevronDown
              className={cn("transition-transform", expanded && "rotate-180")}
            />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="grid grid-cols-1 gap-px bg-border/70 min-[860px]:grid-cols-3">
          <CloudRouteOption
            icon={Mic}
            title="Transcription"
            description="Use Freestyle Cloud for speech-to-text, then clean up with your selected model."
            active={voiceActive && !cleanupActive}
            disabled={!canUse}
            onClick={onUseTranscription}
          />
          <CloudRouteOption
            icon={Sparkles}
            title="Cleanup"
            description="Keep your current transcription model and let Freestyle Cloud polish the text."
            active={!voiceActive && cleanupActive}
            disabled={!canUse || cleanupDisabled}
            onClick={onUseCleanup}
          />
          <CloudRouteOption
            icon={Cloud}
            title="All-in-one"
            description="Send audio once for Freestyle Cloud to transcribe and polish in a single pass."
            active={voiceActive && cleanupActive}
            disabled={!canUse}
            onClick={onUseBoth}
            accent
          />
        </div>
      )}
    </section>
  );
}

function CloudRouteOption({
  icon: Icon,
  title,
  description,
  active,
  disabled,
  onClick,
  accent,
}: {
  icon: typeof Cloud;
  title: string;
  description: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  accent?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "bg-card hover:bg-secondary/40 group flex min-h-[118px] flex-col items-start p-4 text-left transition-colors disabled:cursor-default disabled:opacity-60",
        active && "bg-primary/[0.08] hover:bg-primary/[0.1]",
      )}
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-[9px] border",
          active
            ? "border-primary/30 bg-accent text-accent-foreground"
            : "border-border bg-secondary text-muted-foreground",
          accent && !active && "text-primary",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="mt-3 flex w-full items-center gap-2">
        <span className="text-foreground text-[14px] font-semibold">
          {title}
        </span>
        {active && <CheckCircle className="text-primary ml-auto size-4" />}
      </span>
      <span className="text-muted-foreground mt-1 text-[12px] leading-relaxed">
        {description}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// KeysSection — compact list of stored provider keys (edit / remove)
// ---------------------------------------------------------------------------

function KeysSection({
  apiKeys,
  configured,
  showLocal,
  onEdit,
  onDelete,
}: {
  apiKeys: ApiKeyEntry[];
  configured: ConfiguredModel[];
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
  onEdit,
  onDelete,
}: {
  entry: ApiKeyEntry;
  count: number;
  first: boolean;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const invalid = entry.status === "invalid";
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
      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5 transition-opacity",
          invalid ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Update API key"
          title="Update API key"
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete provider"
          title="Delete provider"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
