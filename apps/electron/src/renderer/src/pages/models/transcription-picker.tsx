import { Button } from "@renderer/components/ui/button";
import { useCloudAuth } from "@renderer/lib/auth-context";
import type { AvailableModel } from "@renderer/lib/models";
import { cn, ON_DEVICE_PHRASE } from "@renderer/lib/utils";
import { Check, Cloud, ExternalLink, Key, Laptop, Mic, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Eyebrow } from "./page-chrome";
import { PickerOption } from "./picker-option";
import type { ConfiguredModel } from "./types";
import type { UseModels } from "./use-models";
import { displayName } from "./utils";

export const FREESTYLE_CLOUD_TIER: AvailableModel = {
  provider_id: "freestyle-cloud",
  provider_name: "Freestyle Transcribe",
  model_id: "freestyle-cloud/stt",
  model_name: "Freestyle Transcribe (Managed)",
  type: "voice",
};

const MANAGED_PROVIDERS = new Set([
  FREESTYLE_CLOUD_TIER.provider_id,
  "local-whisper",
  "local-mlx",
]);

const PICKER_MODAL_BODY = "space-y-5 px-6 py-6";
const PICKER_MODAL_HEADER =
  "border-border flex shrink-0 items-center gap-3 border-b px-6 py-4";

export function recommendedVoiceKey(
  items: { key: string; localEngine?: string }[],
): string {
  return items.some((it) => it.localEngine === "mlx")
    ? "local-mlx/qwen3-0.6b-8bit"
    : "local-whisper/small-q5_1";
}

function isLocalVoice(voice: ConfiguredModel | undefined): boolean {
  return voice?.provider === "local-whisper" || voice?.provider === "local-mlx";
}

function isByokVoice(voice: ConfiguredModel | undefined): boolean {
  if (!voice) return false;
  return !MANAGED_PROVIDERS.has(voice.provider);
}

function voiceMatches(
  voice: ConfiguredModel | undefined,
  modelId: string,
  provider: string,
): boolean {
  return voice?.provider === provider && voice?.model_id === modelId;
}

/**
 * Minimal transcription picker: Freestyle → browse local → browse BYOK.
 */
export function TranscriptionPicker({
  m,
  layout,
  onClose,
  onPickCloud,
  onBrowseLocal,
  onBrowseCloud,
  onConfigureWarming,
  busy,
}: {
  m: UseModels;
  layout: "page" | "modal";
  onClose?: () => void;
  onPickCloud: (model: AvailableModel) => void;
  onBrowseLocal: () => void;
  onBrowseCloud: () => void;
  onConfigureWarming?: () => void;
  busy?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const cloud = useCloudAuth();
  const localItems = m.voiceItems.filter((it) => it.kind === "local");
  const byokCount = m.voiceItems.filter(
    (it) =>
      it.kind === "cloud" &&
      it.available?.provider_id !== FREESTYLE_CLOUD_TIER.provider_id,
  ).length;

  const localActive = isLocalVoice(m.defaultVoice);
  const byokActive = isByokVoice(m.defaultVoice);

  const freestyleSelected = voiceMatches(
    m.defaultVoice,
    FREESTYLE_CLOUD_TIER.model_id,
    FREESTYLE_CLOUD_TIER.provider_id,
  );

  const selectedLocal = localItems.find((it) => it.selected);
  const localHint = selectedLocal
    ? selectedLocal.name
    : localItems.length > 0
      ? t("models.picker.modelCount", { count: localItems.length })
      : t("models.picker.unavailableOnDevice");

  const byokLabel = byokActive
    ? (m.defaultVoice?.model_name ?? displayName(m.defaultVoice!.provider))
    : byokCount > 0
      ? t("models.picker.cloudModelCount", { count: byokCount })
      : t("models.picker.byokProviders");

  const body = (
    <div className={cn(layout === "page" ? "space-y-5" : PICKER_MODAL_BODY)}>
      {layout === "page" && (
        <div className="flex items-center justify-between gap-3">
          <Eyebrow
            text={t("models.picker.transcription")}
            accent
            mono={false}
          />
          {onConfigureWarming && (
            <Button
              variant="link"
              size="sm"
              onClick={onConfigureWarming}
              className="text-muted-foreground h-auto px-0 text-[12px]"
            >
              {t("models.picker.modelWarming")}
            </Button>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => onPickCloud(FREESTYLE_CLOUD_TIER)}
        className={cn(
          "border-border hover:border-primary/35 w-full rounded-[14px] border p-6 text-left transition-[transform,border-color,background-color] duration-150 ease-out active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60",
          freestyleSelected
            ? "border-primary/45 bg-primary/[0.06]"
            : "bg-primary/[0.03]",
        )}
      >
        <div className="flex items-start gap-4">
          <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-[10px]">
            <Cloud className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-foreground text-[15px] font-semibold tracking-[-0.01em]">
                {t("models.picker.freestyleTranscribe")}
              </span>
              {!freestyleSelected && (
                <span className="text-primary text-[10px] font-semibold uppercase tracking-wide">
                  {t("models.picker.recommended")}
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1.5 text-[13px] leading-relaxed">
              {cloud.user
                ? t("models.picker.freestyleBundleSignedIn")
                : t("models.picker.freestyleBundleSignIn")}
            </p>
          </div>
          {freestyleSelected && (
            <Check className="text-primary mt-1 size-[18px] shrink-0" />
          )}
        </div>
      </button>

      <div className="border-border divide-border overflow-hidden rounded-[12px] border divide-y">
        <PickerOption
          icon={Laptop}
          title={t("models.picker.onDevice", { phrase: ON_DEVICE_PHRASE })}
          hint={localHint}
          active={localActive}
          onClick={onBrowseLocal}
          browseLabel={t("models.picker.browseLocalVoice")}
        />
        <PickerOption
          icon={Key}
          title={t("models.picker.yourApiKey")}
          hint={byokLabel}
          active={byokActive}
          onClick={onBrowseCloud}
          browseLabel={t("models.picker.browseByokVoice")}
        />
      </div>
    </div>
  );

  if (layout === "modal") {
    return (
      <>
        <header className={PICKER_MODAL_HEADER}>
          <Mic className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <span className="text-foreground flex-1 text-[13px] font-semibold">
            {t("models.picker.transcription")}
          </span>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="shrink-0"
              aria-label="Close"
            >
              <X />
            </Button>
          )}
        </header>
        {body}
      </>
    );
  }

  return body;
}

export function OpenModelSourceButton({
  url,
}: {
  url: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void window.api?.openExternal(url);
      }}
    >
      <ExternalLink data-icon="inline-start" />
      {t("models.picker.openModelSource")}
    </Button>
  );
}
