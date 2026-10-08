import { Button } from "@renderer/components/ui/button";
import { Switch } from "@renderer/components/ui/switch";
import { useTranslation } from "react-i18next";
import { ModelSettingRow } from "./model-setting-row";
import type { ConfiguredModel } from "./types";
import { displayName } from "./utils";

export function PairCard({
  voice,
  llm,
  llmCleanup,
  cleanupLocked,
  onToggleCleanup,
  onChangeVoice,
  onChangeLlm,
  onConfigureWarming,
}: {
  voice: ConfiguredModel | undefined;
  llm: ConfiguredModel | undefined;
  llmCleanup: boolean;
  /** Freestyle Transcribe includes cleanup; it cannot be toggled independently. */
  cleanupLocked?: boolean;
  onToggleCleanup: (next: boolean) => void;
  onChangeVoice: () => void;
  onChangeLlm: () => void;
  onConfigureWarming?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const cleanupOn = cleanupLocked || llmCleanup;
  const voiceProvider = voice ? displayName(voice.provider) : undefined;
  return (
    <section data-testid="models-configuration">
      <ModelSettingRow
        label={t("models.picker.transcription")}
        model={voice?.model_name ?? t("models.pair.noneSelected")}
        detail={voiceProvider !== voice?.model_name ? voiceProvider : undefined}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={onChangeVoice}
            aria-label={t("models.pair.changeVoice")}
          >
            {voice ? t("models.pair.change") : t("models.pair.pickModel")}
          </Button>
        }
      >
        {onConfigureWarming && (
          <Button
            variant="link"
            size="sm"
            onClick={onConfigureWarming}
            className="text-muted-foreground mt-1 h-auto px-0 text-[11px] font-normal"
          >
            {t("models.pair.configureWarming")}
          </Button>
        )}
      </ModelSettingRow>
      <ModelSettingRow
        label={t("models.picker.cleanup")}
        model={
          cleanupOn
            ? (llm?.model_name ?? t("models.pair.noneSelected"))
            : t("models.overview.off", { defaultValue: "Off" })
        }
        detail={
          !cleanupLocked && cleanupOn && llm
            ? displayName(llm.provider)
            : undefined
        }
        actions={
          cleanupLocked ? (
            <span
              className="text-primary text-[12px] font-medium"
              title={t("models.pair.includedWithFreestyle")}
            >
              {t("models.overview.included", { defaultValue: "Included" })}
            </span>
          ) : (
            <>
              {cleanupOn && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onChangeLlm}
                  aria-label={t("models.overview.changeCleanup", {
                    defaultValue: "Change cleanup model",
                  })}
                >
                  {llm ? t("models.pair.change") : t("models.pair.pickModel")}
                </Button>
              )}
              <Switch
                checked={cleanupOn}
                onCheckedChange={onToggleCleanup}
                aria-label={t("models.overview.enableCleanup", {
                  defaultValue: "Enable cleanup",
                })}
              />
            </>
          )
        }
      />
    </section>
  );
}
