import {
  CLEANUP_CUSTOM_PROMPT_MAX,
  CLEANUP_PRESET_PROMPTS,
  type CleanupIntensity,
} from "@freestyle/validations";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@renderer/components/ui/accordion";
import { Button } from "@renderer/components/ui/button";
import { SegmentedControl } from "@renderer/components/ui/segmented-control";
import { Textarea } from "@renderer/components/ui/textarea";
import { Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Eyebrow } from "./page-chrome";

// ---------------------------------------------------------------------------
// CleanupIntensityCard — level selector (Low/Medium/High/Custom) + the editable
// prompt for the active level. Shown on the Models page only when AI cleanup is
// enabled. Editing a preset seeds the Custom prompt from that preset's text and
// switches to Custom, so the user can build on top of it without mutating the
// presets themselves.
// ---------------------------------------------------------------------------

export function CleanupIntensityCard({
  intensity,
  customPrompt,
  customPromptDirty,
  savingCustomPrompt,
  onIntensityChange,
  onCustomPromptChange,
  onSaveCustomPrompt,
}: {
  intensity: CleanupIntensity;
  customPrompt: string;
  customPromptDirty: boolean;
  savingCustomPrompt: boolean;
  onIntensityChange: (next: CleanupIntensity) => void;
  onCustomPromptChange: (next: string) => void;
  onSaveCustomPrompt: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();

  const isCustom = intensity === "custom";
  const promptValue = isCustom
    ? customPrompt
    : CLEANUP_PRESET_PROMPTS[intensity];

  const options = [
    { value: "low", label: t("models.cleanup.levelLow") },
    { value: "medium", label: t("models.cleanup.levelMedium") },
    { value: "high", label: t("models.cleanup.levelHigh") },
    { value: "custom", label: t("models.cleanup.levelCustom") },
  ];

  const handlePromptChange = (value: string): void => {
    // Editing a preset shifts to Custom, seeding it from the (already
    // preset-populated) text plus the user's edit. Presets stay immutable.
    if (!isCustom) {
      onCustomPromptChange(value);
      onIntensityChange("custom");
      return;
    }
    onCustomPromptChange(value);
  };

  const handleLevelChange = (next: CleanupIntensity): void => {
    // Picking Custom from a preset seeds it with that preset's text (when the
    // custom prompt is still empty) so the user can build on top of it.
    if (next === "custom" && intensity !== "custom" && !customPrompt.trim()) {
      onCustomPromptChange(CLEANUP_PRESET_PROMPTS[intensity]);
    }
    onIntensityChange(next);
  };

  return (
    <section className="border-border bg-card rounded-[14px] border p-6">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
        <Eyebrow text={t("models.cleanup.title")} mono={false} />
        <SegmentedControl
          size="sm"
          options={options}
          value={intensity}
          onValueChange={(v) => handleLevelChange(v as CleanupIntensity)}
        />
      </div>

      <p className="text-muted-foreground max-w-[520px] text-[13px] leading-[1.5]">
        {t(`models.cleanup.desc.${intensity}`)}
      </p>

      <Accordion type="single" collapsible className="mt-3">
        <AccordionItem value="prompt" className="border-b-0">
          <AccordionTrigger>
            {t("models.cleanup.promptToggle")}
          </AccordionTrigger>
          <AccordionContent>
            <Textarea
              value={promptValue}
              maxLength={CLEANUP_CUSTOM_PROMPT_MAX}
              onChange={(e) => handlePromptChange(e.target.value)}
              spellCheck={false}
              className="mono min-h-[180px] resize-y text-[12px] leading-[1.6]"
              aria-label={t("models.cleanup.promptLabel")}
            />

            <div className="text-muted-foreground mt-2.5 flex items-center justify-between gap-3 text-[11px]">
              <span>
                {isCustom
                  ? t("models.cleanup.customHint")
                  : t("models.cleanup.presetHint")}
              </span>
              {isCustom && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => onIntensityChange("low")}
                  >
                    {t("models.cleanup.resetToPresets")}
                  </Button>
                  <Button
                    variant="ink"
                    size="sm"
                    onClick={onSaveCustomPrompt}
                    disabled={savingCustomPrompt || !customPromptDirty}
                  >
                    {savingCustomPrompt ? (
                      <>
                        <Loader2 className="animate-spin" />
                        {t("models.cleanup.saving")}
                      </>
                    ) : customPromptDirty ? (
                      t("models.cleanup.save")
                    ) : (
                      <>
                        <Check />
                        {t("models.cleanup.saved")}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
