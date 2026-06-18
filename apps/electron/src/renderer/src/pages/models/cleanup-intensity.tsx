import { CLEANUP_PRESET_PROMPTS } from "@freestyle/utils";
import type { CleanupIntensity } from "@freestyle/validations";
import { CLEANUP_CUSTOM_PROMPT_MAX } from "@freestyle/validations";
import { Button } from "@renderer/components/ui/button";
import { SegmentedControl } from "@renderer/components/ui/segmented-control";
import { Textarea } from "@renderer/components/ui/textarea";
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
  onIntensityChange,
  onCustomPromptChange,
}: {
  intensity: CleanupIntensity;
  customPrompt: string;
  onIntensityChange: (next: CleanupIntensity) => void;
  onCustomPromptChange: (next: string) => void;
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

      <p className="text-muted-foreground mb-4 max-w-[520px] text-[13px] leading-[1.5]">
        {t(`models.cleanup.desc.${intensity}`)}
      </p>

      <Textarea
        value={promptValue}
        maxLength={CLEANUP_CUSTOM_PROMPT_MAX}
        onChange={(e) => handlePromptChange(e.target.value)}
        spellCheck={false}
        className="mono min-h-[180px] resize-y text-[12px] leading-[1.6]"
        aria-label={t("models.cleanup.promptLabel")}
      />

      <div className="text-muted-foreground mt-2 flex items-center justify-between text-[11px]">
        <span>
          {isCustom
            ? t("models.cleanup.customHint")
            : t("models.cleanup.presetHint")}
        </span>
        {isCustom && (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => onIntensityChange("low")}
          >
            {t("models.cleanup.resetToPresets")}
          </Button>
        )}
      </div>
    </section>
  );
}
