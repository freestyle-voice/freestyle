import { Button } from "@renderer/components/ui/button";
import { useCloudAuth } from "@renderer/lib/auth-context";
import type { AvailableModel } from "@renderer/lib/models";
import { cn, ON_DEVICE_PHRASE } from "@renderer/lib/utils";
import { Check, Cloud, ExternalLink, Key, Laptop, Mic } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  PICKER_MODAL_BODY,
  PickerModalHeader,
  PickerOption,
} from "./picker-option";
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

export const FREESTYLE_CLOUD_CLEANUP: AvailableModel = {
  provider_id: "freestyle-cloud",
  provider_name: "Freestyle Transcribe",
  model_id: "freestyle-cloud/post-process",
  model_name: "Freestyle Cleanup",
  type: "llm",
};

const MANAGED_PROVIDERS = new Set([
  FREESTYLE_CLOUD_TIER.provider_id,
  "local-whisper",
  "local-mlx",
]);

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

/** Modal tier picker: Freestyle bundle → browse local → browse BYOK. */
export function TranscriptionPicker({
  m,
  onClose,
  onPickCloud,
  onBrowseLocal,
  onBrowseCloud,
  busy,
}: {
  m: UseModels;
  onClose: () => void;
  onPickCloud: (model: AvailableModel) => void;
  onBrowseLocal: () => void;
  onBrowseCloud: () => void;
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

  return (
    <>
      <PickerModalHeader
        icon={Mic}
        title={t("models.picker.transcription")}
        onClose={onClose}
      />
      <div className={PICKER_MODAL_BODY}>
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
    </>
  );
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
