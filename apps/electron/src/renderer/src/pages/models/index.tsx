import { Button } from "@renderer/components/ui/button";
import type { AvailableModel } from "@renderer/lib/models";
import { cn, ON_DEVICE_PHRASE } from "@renderer/lib/utils";
import {
  CheckCircle,
  Key,
  Laptop,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { CleanupIntensityCard } from "./cleanup-intensity";
import { CloudAccountCard } from "./cloud-account";
import { MlxWarmingDialog } from "./mlx-memory-section";
import { ConfirmDialog, type ModalState, ModelModal } from "./model-modal";
import { Eyebrow, PageHeader, PageShell } from "./page-chrome";
import { PairCard } from "./pair-card";
import type { ApiKeyEntry, ConfiguredModel } from "./types";
import { useCloudAuth } from "./use-cloud-auth";
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

  // -------------------------------------------------------------------------
  // Modal flow
  // -------------------------------------------------------------------------

  const closeModal = (): void => {
    setModal(null);
    setKeyError(null);
    setSaving(false);
  };

  const openVoice = (): void => setModal({ kind: "list", type: "voice" });
  const openLlm = (): void => {
    m.setCleanup(true);
    setModal({ kind: "list", type: "llm" });
  };

  const onPickCloud = (model: AvailableModel): void => {
    if (modal?.kind !== "list") return;
    const type = modal.type;

    // Freestyle Cloud requires a signed-in user — run the OAuth flow first,
    // then configure (and disable local cleanup) only if sign-in succeeds.
    if (
      type === "voice" &&
      model.provider_id === FREESTYLE_CLOUD_PROVIDER &&
      !cloudAuth.user
    ) {
      void cloudAuth.signIn().then((user) => {
        if (!user) return;
        void m.configureModel(model, type).then(() => {
          m.setCleanup(false);
          closeModal();
        });
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
        type,
        provider: model.provider_id,
        modelName: model.model_name,
        pendingModel: model,
      });
      return;
    }
    void m.configureModel(model, type).then(() => {
      // Freestyle Cloud runs its own cleanup; disable local post-processing
      // so we surface the cloud's cleaned text without a second pass.
      if (type === "voice" && model.provider_id === FREESTYLE_CLOUD_PROVIDER) {
        m.setCleanup(false);
      }
      closeModal();
    });
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

  // Self-correct a stale enabled setting (e.g. page opened with Freestyle Cloud
  // already selected) so the backend never runs a redundant second cleanup
  // pass. Kept above the loading early-return to satisfy the Rules of Hooks.
  const cloudVoiceActive =
    m.defaultVoice?.provider === FREESTYLE_CLOUD_PROVIDER;
  useEffect(() => {
    if (cloudVoiceActive && m.llmCleanup) m.setCleanup(false);
  }, [cloudVoiceActive, m.llmCleanup, m.setCleanup]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (m.loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-24">
          <p className="text-muted-foreground text-sm">{t("models.loading")}</p>
        </div>
      </PageShell>
    );
  }

  const hasLocalVoice = m.configured.some(
    (c) => c.provider === "local-whisper" || c.provider === "local-mlx",
  );

  // Freestyle Cloud does its own cleanup, so local post-processing is locked
  // off while it's the active voice provider.
  const cleanupLocked = m.defaultVoice?.provider === FREESTYLE_CLOUD_PROVIDER;

  // Show the MLX warming control when MLX is the active voice engine, or the
  // platform supports MLX and at least one MLX model is downloaded.
  const showMlxWarming =
    m.defaultVoice?.provider === "local-mlx" ||
    (!!m.mlxStatus?.platformSupported &&
      m.mlxStatus.models.some((model) => model.status === "ready"));

  return (
    <PageShell>
      <PageHeader title={t("models.title")} />
      <div className="space-y-6">
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

        <CloudAccountCard auth={cloudAuth} />

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
