import { Button } from "@renderer/components/ui/button";
import { Toggle } from "@renderer/components/voice-row";
import { cn } from "@renderer/lib/utils";
import { useTranslation } from "react-i18next";

import { Eyebrow } from "./page-chrome";
import type { ConfiguredModel } from "./types";
import { displayName } from "./utils";

// ---------------------------------------------------------------------------
// PairCard — the current model pair: Voice (required) + cleanup model.
// Side-by-side layout; each "Change" opens the shared model modal. The cleanup
// side owns the on/off switch for post-processing (llm_cleanup).
// ---------------------------------------------------------------------------

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
  /** When true, cleanup stays on and the toggle is disabled (Freestyle Transcribe). */
  cleanupLocked?: boolean;
  onToggleCleanup: (next: boolean) => void;
  onChangeVoice: () => void;
  onChangeLlm: () => void;
  /** When set, shows a "Configure model warming" link below the voice button. */
  onConfigureWarming?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const cleanupOn = cleanupLocked || llmCleanup;

  return (
    <section className="border-border bg-card grid grid-cols-1 gap-6 rounded-[14px] border p-6 min-[820px]:grid-cols-2">
      <PairSide
        kicker={t("models.pair.transcriptionKicker")}
        modelName={voice?.model_name}
        providerName={voice ? displayName(voice.provider) : undefined}
        cta={t("models.pair.changeVoiceShort")}
        ctaAriaLabel={t("models.pair.changeVoice")}
        noneLabel={t("models.pair.noneSelected")}
        onChange={onChangeVoice}
        warmingAction={
          onConfigureWarming
            ? {
                label: t("models.pair.configureWarming"),
                onClick: onConfigureWarming,
              }
            : undefined
        }
      />
      <div className="border-border border-t pt-6 min-[820px]:border-l min-[820px]:border-t-0 min-[820px]:pl-6 min-[820px]:pt-0">
        <PairSide
          kicker={
            cleanupLocked
              ? t("models.pair.cleanupKickerLocked")
              : t("models.pair.cleanupKicker")
          }
          modelName={cleanupOn ? llm?.model_name : undefined}
          providerName={
            cleanupLocked
              ? t("models.pair.includedWithFreestyle")
              : cleanupOn && llm
                ? displayName(llm.provider)
                : undefined
          }
          cta={llm ? t("models.pair.change") : t("models.pair.pickModel")}
          noneLabel={t("models.pair.noneSelected")}
          toggle={cleanupOn}
          toggleDisabled={cleanupLocked}
          onToggle={onToggleCleanup}
          onChange={onChangeLlm}
          changeDisabled={cleanupLocked}
          dimmed={!cleanupOn}
          providerIsIncluded={cleanupLocked}
        />
      </div>
    </section>
  );
}

function PairSide({
  kicker,
  modelName,
  providerName,
  cta,
  ctaAriaLabel,
  noneLabel,
  toggle,
  toggleDisabled,
  onToggle,
  onChange,
  changeDisabled,
  dimmed,
  providerIsIncluded,
  warmingAction,
}: {
  kicker: string;
  modelName: string | undefined;
  providerName: string | undefined;
  cta: string;
  ctaAriaLabel?: string;
  noneLabel: string;
  toggle?: boolean;
  toggleDisabled?: boolean;
  onToggle?: (next: boolean) => void;
  onChange: () => void;
  changeDisabled?: boolean;
  dimmed?: boolean;
  providerIsIncluded?: boolean;
  warmingAction?: { label: string; onClick: () => void };
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-4 transition-opacity",
        dimmed && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Eyebrow text={kicker} mono={false} />
        {onToggle !== undefined && (
          <Toggle
            on={!!toggle}
            onChange={(v) => onToggle(v)}
            disabled={toggleDisabled}
          />
        )}
      </div>
      <div>
        {modelName ? (
          <div
            className="serif text-foreground"
            style={{
              fontSize: 34,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              fontWeight: 400,
            }}
          >
            {modelName}
          </div>
        ) : (
          <div
            className="serif-italic text-muted-foreground"
            style={{ fontSize: 30, lineHeight: 1.1 }}
          >
            {noneLabel}
          </div>
        )}
        {providerName && (
          <div
            className={cn(
              "mt-1.5 text-[13px]",
              providerIsIncluded
                ? "text-muted-foreground"
                : "text-muted-foreground",
            )}
          >
            {providerIsIncluded ? (
              providerName
            ) : (
              <>
                {t("models.pair.via")}{" "}
                <span className="text-foreground/80 font-medium">
                  {providerName}
                </span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="mt-auto flex flex-col items-start gap-2.5 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onChange}
          disabled={changeDisabled}
          aria-label={ctaAriaLabel}
        >
          {cta}
        </Button>
        {warmingAction && (
          <Button
            variant="link"
            size="sm"
            onClick={warmingAction.onClick}
            className="text-muted-foreground h-auto px-0 text-[13px] font-normal"
          >
            {warmingAction.label}
          </Button>
        )}
      </div>
    </div>
  );
}
