import {
  CLEANUP_CUSTOM_PROMPT_MAX,
  CLEANUP_PRESET_PROMPTS,
} from "@freestyle-voice/validations";
import { Button } from "@renderer/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { Textarea } from "@renderer/components/ui/textarea";
import { Check, ChevronDown, ChevronLeft, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { Eyebrow, PageHeader, PageShell } from "../models/page-chrome";
import { ToneStateBanner } from "./banners";
import { useToneSettings } from "./use-tone-settings";

/**
 * The custom cleanup prompt, on its own page.
 *
 * Inline on the index this editor outweighed every other control and pushed
 * all four destination rows below the fold, for a setting most people never
 * open. The index keeps a preview row that links here.
 */
export default function ToneCustomPromptPage(): React.JSX.Element {
  const { t } = useTranslation();
  const settings = useToneSettings();
  const location = useLocation();

  // Arriving from the Strength control with nothing written: fill from the
  // preset being left, so you start by editing something that works. Seeded
  // here rather than at selection time so it can't race the navigation, and
  // only once settings have loaded so it can't overwrite a stored prompt.
  const seedFrom = (location.state as { seedFrom?: string } | null)?.seedFrom;
  const { loading, savedCleanupCustomPrompt, seedCustomPromptFrom } = settings;
  const seedRequested = useRef(false);
  useEffect(() => {
    if (loading || seedRequested.current) return;
    if (savedCleanupCustomPrompt.trim()) return;
    if (seedFrom !== "low" && seedFrom !== "medium" && seedFrom !== "high") {
      return;
    }
    seedRequested.current = true;
    void seedCustomPromptFrom(seedFrom);
  }, [loading, savedCleanupCustomPrompt, seedFrom, seedCustomPromptFrom]);

  if (settings.loading) {
    return (
      <PageShell>
        <div className="mx-auto w-full max-w-[1060px]">
          <div className="flex items-center justify-center py-24">
            <p className="text-muted-foreground text-sm">{t("tone.loading")}</p>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1060px]">
        <Link
          to="/settings/tone"
          className="text-muted-foreground hover:text-foreground -ml-1 mb-4 inline-flex items-center gap-1 text-[12px] transition-colors"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          {t("tone.customPrompt.backToTone")}
        </Link>

        <PageHeader
          title={t("tone.customPrompt.title")}
          subtitle={t("tone.customPrompt.subtitle")}
        />

        <ToneStateBanner settings={settings} />

        <section className="mt-7 mb-2">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <Eyebrow text={t("models.cleanup.promptLabel")} mono />
            {/* Was "Reset to presets", which switched Strength back to Low and
                left Custom altogether. Same entry point, different job: load a
                preset's text as a starting draft and stay in Custom, so you can
                rework one instead of starting from an empty box. Left unsaved
                so it's yours to edit before it counts. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[12px]">
                  {t("tone.customPrompt.startFrom")}
                  <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(["low", "medium", "high"] as const).map((preset) => (
                  <DropdownMenuItem
                    key={preset}
                    onSelect={() =>
                      settings.setCleanupCustomPrompt(
                        CLEANUP_PRESET_PROMPTS[preset],
                      )
                    }
                  >
                    {t(`tone.cleanup.cards.${preset}.title`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Textarea
            value={settings.cleanupCustomPrompt}
            maxLength={CLEANUP_CUSTOM_PROMPT_MAX}
            onChange={(event) =>
              settings.setCleanupCustomPrompt(event.target.value)
            }
            spellCheck={false}
            placeholder={t("tone.customPrompt.placeholder")}
            className="mono min-h-[320px] resize-y text-[12px] leading-[1.65]"
            aria-label={t("models.cleanup.promptLabel")}
          />
          <div className="text-muted-foreground mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <span>
              {settings.cleanupCustomPrompt.length} /{" "}
              {CLEANUP_CUSTOM_PROMPT_MAX}
            </span>
            <Button
              variant="ink"
              size="sm"
              onClick={() => void settings.saveCleanupCustomPrompt()}
              // Saving an empty prompt is blocked, so nobody can create the
              // state where Custom is selected with nothing behind it. The
              // server would silently run Low, which is not what picking
              // "Custom" led you to expect.
              disabled={
                settings.savingCustomPrompt ||
                !settings.customPromptDirty ||
                !settings.cleanupCustomPrompt.trim()
              }
            >
              {settings.savingCustomPrompt ? (
                <>
                  <Loader2 className="animate-spin" />
                  {t("models.cleanup.saving")}
                </>
              ) : settings.customPromptDirty ? (
                t("models.cleanup.save")
              ) : (
                <>
                  <Check />
                  {t("models.cleanup.saved")}
                </>
              )}
            </Button>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
