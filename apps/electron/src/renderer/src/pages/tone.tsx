import {
  CLEANUP_CUSTOM_PROMPT_MAX,
  CLEANUP_PRESET_PROMPTS,
  type CleanupAppAssignment,
  type CleanupEmailTone,
  type CleanupIntensity,
  type CleanupOverallTone,
  type CleanupPersonalTone,
  type CleanupToneDestination,
  type CleanupWorkTone,
  parseCleanupAppAssignments,
  parseCleanupEmailTone,
  parseCleanupIntensity,
  parseCleanupOverallTone,
  parseCleanupPersonalTone,
  parseCleanupWorkTone,
} from "@freestyle-voice/validations";
import { AppAssignments } from "@renderer/components/tone-previews/app-assignments";
import {
  type AppMarkId,
  AppMarkRow,
} from "@renderer/components/tone-previews/app-marks";
import { CleanupPreview } from "@renderer/components/tone-previews/cleanup-preview";
import { EmailPreview } from "@renderer/components/tone-previews/email-preview";
import { NotePreview } from "@renderer/components/tone-previews/note-preview";
import {
  getVisibleBuiltinRouteIds,
  normalizeManagedAssignments,
} from "@renderer/components/tone-previews/route-ownership";
import { TextMessagePreview } from "@renderer/components/tone-previews/text-message-preview";
import { WorkChatPreview } from "@renderer/components/tone-previews/work-chat-preview";
import { Button } from "@renderer/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@renderer/components/ui/tabs";
import { Textarea } from "@renderer/components/ui/textarea";
import { getClient } from "@renderer/lib/api";
import { cn } from "@renderer/lib/utils";
import { Check, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  DEFAULT_CLEANUP_EMAIL_TONE,
  DEFAULT_CLEANUP_OVERALL_TONE,
  DEFAULT_CLEANUP_PERSONAL_TONE,
  DEFAULT_CLEANUP_WORK_TONE,
} from "../../../shared/cleanup-tone-settings";
import { SETTINGS_KEYS } from "../../../shared/settings-keys";
import { Eyebrow, PageHeader, PageShell } from "./models/page-chrome";
import type { ConfiguredModel } from "./models/types";

type ToneTab =
  | "cleanup"
  | Exclude<CleanupToneDestination, "overall">
  | "everythingElse";

type CleanupCardValue = CleanupIntensity | "off";

type ToneCardOption<T extends string> = {
  value: T;
  titleKey: string;
  descKey: string;
  sampleKey: string;
};

const CLEANUP_OPTIONS: ToneCardOption<CleanupCardValue>[] = [
  {
    value: "off",
    titleKey: "tone.cleanup.cards.off.title",
    descKey: "tone.cleanup.cards.off.desc",
    sampleKey: "tone.cleanup.cards.off.sample",
  },
  {
    value: "low",
    titleKey: "tone.cleanup.cards.low.title",
    descKey: "tone.cleanup.cards.low.desc",
    sampleKey: "tone.cleanup.cards.low.sample",
  },
  {
    value: "medium",
    titleKey: "tone.cleanup.cards.medium.title",
    descKey: "tone.cleanup.cards.medium.desc",
    sampleKey: "tone.cleanup.cards.medium.sample",
  },
  {
    value: "high",
    titleKey: "tone.cleanup.cards.high.title",
    descKey: "tone.cleanup.cards.high.desc",
    sampleKey: "tone.cleanup.cards.high.sample",
  },
  {
    value: "custom",
    titleKey: "tone.cleanup.cards.custom.title",
    descKey: "tone.cleanup.cards.custom.desc",
    sampleKey: "tone.cleanup.cards.custom.sample",
  },
];

const PERSONAL_OPTIONS: ToneCardOption<CleanupPersonalTone>[] = [
  {
    value: "polished",
    titleKey: "tone.personal.cards.polished.title",
    descKey: "tone.personal.cards.polished.desc",
    sampleKey: "tone.personal.cards.polished.sample",
  },
  {
    value: "casual",
    titleKey: "tone.personal.cards.casual.title",
    descKey: "tone.personal.cards.casual.desc",
    sampleKey: "tone.personal.cards.casual.sample",
  },
  {
    value: "very_casual",
    titleKey: "tone.personal.cards.very_casual.title",
    descKey: "tone.personal.cards.very_casual.desc",
    sampleKey: "tone.personal.cards.very_casual.sample",
  },
];

const WORK_OPTIONS: ToneCardOption<CleanupWorkTone>[] = [
  {
    value: "direct",
    titleKey: "tone.work.cards.direct.title",
    descKey: "tone.work.cards.direct.desc",
    sampleKey: "tone.work.cards.direct.sample",
  },
  {
    value: "friendly",
    titleKey: "tone.work.cards.friendly.title",
    descKey: "tone.work.cards.friendly.desc",
    sampleKey: "tone.work.cards.friendly.sample",
  },
  {
    value: "formal",
    titleKey: "tone.work.cards.formal.title",
    descKey: "tone.work.cards.formal.desc",
    sampleKey: "tone.work.cards.formal.sample",
  },
];

const EMAIL_OPTIONS: ToneCardOption<CleanupEmailTone>[] = [
  {
    value: "casual",
    titleKey: "tone.email.cards.casual.title",
    descKey: "tone.email.cards.casual.desc",
    sampleKey: "tone.email.cards.casual.sample",
  },
  {
    value: "warm",
    titleKey: "tone.email.cards.warm.title",
    descKey: "tone.email.cards.warm.desc",
    sampleKey: "tone.email.cards.warm.sample",
  },
  {
    value: "formal",
    titleKey: "tone.email.cards.formal.title",
    descKey: "tone.email.cards.formal.desc",
    sampleKey: "tone.email.cards.formal.sample",
  },
];

const OVERALL_OPTIONS: ToneCardOption<CleanupOverallTone>[] = [
  {
    value: "casual",
    titleKey: "tone.everythingElse.cards.casual.title",
    descKey: "tone.everythingElse.cards.casual.desc",
    sampleKey: "tone.everythingElse.cards.casual.sample",
  },
  {
    value: "neutral",
    titleKey: "tone.everythingElse.cards.neutral.title",
    descKey: "tone.everythingElse.cards.neutral.desc",
    sampleKey: "tone.everythingElse.cards.neutral.sample",
  },
  {
    value: "professional",
    titleKey: "tone.everythingElse.cards.professional.title",
    descKey: "tone.everythingElse.cards.professional.desc",
    sampleKey: "tone.everythingElse.cards.professional.sample",
  },
];

export default function TonePage(): React.JSX.Element {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [llmCleanup, setLlmCleanup] = useState(false);
  const [cleanupIntensity, setCleanupIntensity] =
    useState<CleanupIntensity>("low");
  const [cleanupCustomPrompt, setCleanupCustomPrompt] = useState("");
  const [savedCleanupCustomPrompt, setSavedCleanupCustomPrompt] = useState("");
  const [savingCustomPrompt, setSavingCustomPrompt] = useState(false);
  const [personalTone, setPersonalTone] = useState<CleanupPersonalTone>(
    DEFAULT_CLEANUP_PERSONAL_TONE,
  );
  const [workTone, setWorkTone] = useState<CleanupWorkTone>(
    DEFAULT_CLEANUP_WORK_TONE,
  );
  const [emailTone, setEmailTone] = useState<CleanupEmailTone>(
    DEFAULT_CLEANUP_EMAIL_TONE,
  );
  const [overallTone, setOverallTone] = useState<CleanupOverallTone>(
    DEFAULT_CLEANUP_OVERALL_TONE,
  );
  const [assignments, setAssignments] = useState<CleanupAppAssignment[]>([]);
  const [hasCleanupModel, setHasCleanupModel] = useState(false);
  const [activeTab, setActiveTab] = useState<ToneTab>("cleanup");

  const customPromptDirty = cleanupCustomPrompt !== savedCleanupCustomPrompt;

  const loadData = useCallback(async () => {
    try {
      const client = getClient();
      const [settingsRes, modelsRes] = await Promise.all([
        client.api.settings.$get(),
        client.api.models.configured.$get(),
      ]);

      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setLlmCleanup(settings[SETTINGS_KEYS.llmCleanup] === "true");
        setCleanupIntensity(
          parseCleanupIntensity(settings[SETTINGS_KEYS.cleanupIntensity]),
        );

        const prompt = settings[SETTINGS_KEYS.cleanupCustomPrompt];
        if (typeof prompt === "string") {
          setCleanupCustomPrompt(prompt);
          setSavedCleanupCustomPrompt(prompt);
        }

        setPersonalTone(
          parseCleanupPersonalTone(settings[SETTINGS_KEYS.cleanupPersonalTone]),
        );
        setWorkTone(
          parseCleanupWorkTone(settings[SETTINGS_KEYS.cleanupWorkTone]),
        );
        setEmailTone(
          parseCleanupEmailTone(settings[SETTINGS_KEYS.cleanupEmailTone]),
        );
        setOverallTone(
          parseCleanupOverallTone(settings[SETTINGS_KEYS.cleanupOverallTone]),
        );
        setAssignments(
          normalizeManagedAssignments(
            parseCleanupAppAssignments(
              settings[SETTINGS_KEYS.cleanupAppAssignments],
            ),
          ),
        );
      }

      if (modelsRes.ok) {
        const configured = (await modelsRes.json()) as ConfiguredModel[];
        setHasCleanupModel(
          configured.some(
            (model) => model.type === "llm" && model.is_default === 1,
          ),
        );
      }
    } catch (err) {
      console.error("Failed to load tone settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveSetting = useCallback(async (key: string, value: string) => {
    await getClient().api.settings[":key"].$put({
      param: { key },
      json: { value },
    });
  }, []);

  const selectCleanupMode = useCallback(
    (next: CleanupCardValue) => {
      if (next === "off") {
        setLlmCleanup(false);
        saveSetting(SETTINGS_KEYS.llmCleanup, "false").catch((err) =>
          console.error("Failed to toggle cleanup:", err),
        );
        return;
      }

      if (next === "custom" && cleanupIntensity !== "custom") {
        const seed =
          cleanupCustomPrompt.trim() ||
          CLEANUP_PRESET_PROMPTS[cleanupIntensity];
        setCleanupCustomPrompt(seed);
      }

      setLlmCleanup(true);
      setCleanupIntensity(next);
      saveSetting(SETTINGS_KEYS.llmCleanup, "true").catch((err) =>
        console.error("Failed to toggle cleanup:", err),
      );
      saveSetting(SETTINGS_KEYS.cleanupIntensity, next).catch((err) =>
        console.error("Failed to save cleanup strength:", err),
      );
    },
    [cleanupCustomPrompt, cleanupIntensity, saveSetting],
  );

  const saveCleanupCustomPrompt = useCallback(async () => {
    const value = cleanupCustomPrompt;
    setSavingCustomPrompt(true);
    try {
      await saveSetting(SETTINGS_KEYS.cleanupCustomPrompt, value);
      setSavedCleanupCustomPrompt(value);
    } catch (err) {
      console.error("Failed to save cleanup custom prompt:", err);
    } finally {
      setSavingCustomPrompt(false);
    }
  }, [cleanupCustomPrompt, saveSetting]);

  const resetToPresetMode = useCallback(() => {
    selectCleanupMode("low");
  }, [selectCleanupMode]);

  const savePersonalTone = useCallback(
    (value: CleanupPersonalTone) => {
      setPersonalTone(value);
      saveSetting(SETTINGS_KEYS.cleanupPersonalTone, value).catch((err) =>
        console.error("Failed to save personal tone:", err),
      );
    },
    [saveSetting],
  );

  const saveWorkTone = useCallback(
    (value: CleanupWorkTone) => {
      setWorkTone(value);
      saveSetting(SETTINGS_KEYS.cleanupWorkTone, value).catch((err) =>
        console.error("Failed to save work tone:", err),
      );
    },
    [saveSetting],
  );

  const saveEmailTone = useCallback(
    (value: CleanupEmailTone) => {
      setEmailTone(value);
      saveSetting(SETTINGS_KEYS.cleanupEmailTone, value).catch((err) =>
        console.error("Failed to save email tone:", err),
      );
    },
    [saveSetting],
  );

  const saveOverallTone = useCallback(
    (value: CleanupOverallTone) => {
      setOverallTone(value);
      saveSetting(SETTINGS_KEYS.cleanupOverallTone, value).catch((err) =>
        console.error("Failed to save everything-else tone:", err),
      );
    },
    [saveSetting],
  );

  const persistAssignments = useCallback(
    (next: CleanupAppAssignment[]) => {
      const normalized = normalizeManagedAssignments(next);
      setAssignments(normalized);
      saveSetting(
        SETTINGS_KEYS.cleanupAppAssignments,
        JSON.stringify(normalized),
      ).catch((err) => console.error("Failed to save app assignments:", err));
    },
    [saveSetting],
  );

  const addAssignment = useCallback(
    (assignment: CleanupAppAssignment) => {
      // A given app/site maps to exactly one group — a re-add moves it.
      persistAssignments([
        ...assignments.filter((a) => a.match !== assignment.match),
        assignment,
      ]);
    },
    [assignments, persistAssignments],
  );

  const removeAssignment = useCallback(
    (match: string) => {
      persistAssignments(assignments.filter((a) => a.match !== match));
    },
    [assignments, persistAssignments],
  );

  const cleanupMode: CleanupCardValue = llmCleanup ? cleanupIntensity : "off";

  if (loading) {
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
        <PageHeader title={t("tone.title")} subtitle={t("tone.subtitle")} />

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ToneTab)}
          className="mt-8 gap-7"
        >
          <TabsList className="h-11 w-fit max-w-full items-stretch gap-1 self-start overflow-x-auto overflow-y-hidden rounded-full border border-border bg-card p-[3px]">
            {(
              [
                ["cleanup", "tone.tabs.cleanup"],
                ["personal", "tone.tabs.personal"],
                ["work", "tone.tabs.work"],
                ["email", "tone.tabs.email"],
                ["everythingElse", "tone.tabs.everythingElse"],
              ] as const
            ).map(([value, key]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-full flex-none rounded-full px-4 py-0 text-[13px] font-medium leading-none data-active:bg-accent data-active:text-accent-foreground dark:data-active:border-transparent dark:data-active:bg-accent dark:data-active:text-accent-foreground"
              >
                {t(key)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="cleanup" className="mt-0">
            <CleanupTonePanel
              value={cleanupMode}
              onChange={selectCleanupMode}
              cleanupCustomPrompt={cleanupCustomPrompt}
              onCustomPromptChange={setCleanupCustomPrompt}
              customPromptDirty={customPromptDirty}
              onSaveCustomPrompt={() => void saveCleanupCustomPrompt()}
              onResetToPreset={resetToPresetMode}
              savingCustomPrompt={savingCustomPrompt}
              hasCleanupModel={hasCleanupModel}
            />
          </TabsContent>

          <TabsContent value="personal" className="mt-0">
            <SubsetTonePanel
              destination="personal"
              previewKind="personal"
              title={t("tone.personal.title")}
              apps={getVisibleBuiltinRouteIds("personal", assignments)}
              value={personalTone}
              options={PERSONAL_OPTIONS}
              onChange={savePersonalTone}
              assignments={assignments.filter(
                (a) => a.destination === "personal",
              )}
              allAssignments={assignments}
              onAddAssignment={addAssignment}
              onRemoveAssignment={removeAssignment}
            />
          </TabsContent>

          <TabsContent value="work" className="mt-0">
            <SubsetTonePanel
              destination="work"
              previewKind="work"
              title={t("tone.work.title")}
              apps={getVisibleBuiltinRouteIds("work", assignments)}
              value={workTone}
              options={WORK_OPTIONS}
              onChange={saveWorkTone}
              assignments={assignments.filter((a) => a.destination === "work")}
              allAssignments={assignments}
              onAddAssignment={addAssignment}
              onRemoveAssignment={removeAssignment}
            />
          </TabsContent>

          <TabsContent value="email" className="mt-0">
            <SubsetTonePanel
              destination="email"
              previewKind="email"
              title={t("tone.email.title")}
              apps={getVisibleBuiltinRouteIds("email", assignments)}
              value={emailTone}
              options={EMAIL_OPTIONS}
              onChange={saveEmailTone}
              assignments={assignments.filter((a) => a.destination === "email")}
              allAssignments={assignments}
              onAddAssignment={addAssignment}
              onRemoveAssignment={removeAssignment}
            />
          </TabsContent>

          <TabsContent value="everythingElse" className="mt-0">
            <SubsetTonePanel
              destination="overall"
              previewKind="overall"
              title={t("tone.everythingElse.title")}
              desc={t("tone.everythingElse.desc")}
              apps={[]}
              value={overallTone}
              options={OVERALL_OPTIONS}
              onChange={saveOverallTone}
              assignments={assignments.filter(
                (a) => a.destination === "overall",
              )}
              allAssignments={assignments}
              onAddAssignment={addAssignment}
              onRemoveAssignment={removeAssignment}
            />
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}

function CleanupTonePanel({
  value,
  onChange,
  cleanupCustomPrompt,
  onCustomPromptChange,
  customPromptDirty,
  onSaveCustomPrompt,
  onResetToPreset,
  savingCustomPrompt,
  hasCleanupModel,
}: {
  value: CleanupCardValue;
  onChange: (value: CleanupCardValue) => void;
  cleanupCustomPrompt: string;
  onCustomPromptChange: (value: string) => void;
  customPromptDirty: boolean;
  onSaveCustomPrompt: () => void;
  onResetToPreset: () => void;
  savingCustomPrompt: boolean;
  hasCleanupModel: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();

  const handleOptionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (
        ![
          "ArrowRight",
          "ArrowDown",
          "ArrowLeft",
          "ArrowUp",
          "Home",
          "End",
        ].includes(event.key)
      ) {
        return;
      }

      event.preventDefault();

      if (event.key === "Home") {
        onChange(CLEANUP_OPTIONS[0]!.value);
        return;
      }

      if (event.key === "End") {
        onChange(CLEANUP_OPTIONS.at(-1)!.value);
        return;
      }

      const delta =
        event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        (index + delta + CLEANUP_OPTIONS.length) % CLEANUP_OPTIONS.length;
      onChange(CLEANUP_OPTIONS[nextIndex]!.value);
    },
    [onChange],
  );

  return (
    <div className="space-y-6">
      <section className="border-t border-border/70 pt-5">
        <h2 className="text-foreground text-[28px] leading-[1.05] font-medium tracking-[-0.03em]">
          {t("tone.cleanup.title")}
        </h2>
        <p className="text-muted-foreground mt-2 max-w-[52ch] text-[13px] leading-[1.55]">
          {t("tone.cleanup.desc")}
        </p>
      </section>

      {!hasCleanupModel ? (
        <div className="border-border/70 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed px-4 py-3">
          <div className="min-w-0">
            <p className="text-foreground text-[13px] font-medium">
              {t("tone.cleanup.noModelTitle")}
            </p>
            <p className="text-muted-foreground mt-0.5 text-[12px] leading-[1.5]">
              {t("tone.cleanup.noModelDesc")}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/models">{t("tone.cleanup.noModelCta")}</Link>
          </Button>
        </div>
      ) : null}

      <div
        role="radiogroup"
        aria-label={t("tone.cleanup.title")}
        className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 min-[960px]:grid-cols-5"
      >
        {CLEANUP_OPTIONS.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              className={cn(
                "border-border bg-card flex flex-col rounded-[18px] border p-4 text-left transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
                "hover:border-foreground/20 hover:bg-card/90",
                selected && "border-primary/35 bg-accent/45",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="serif text-foreground text-[26px] leading-none tracking-[-0.03em]">
                  {t(option.titleKey)}
                </p>
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border",
                    selected
                      ? "border-primary/35 bg-primary text-primary-foreground"
                      : "border-border bg-background text-transparent",
                  )}
                >
                  <CheckCircle2 className="size-3.5" />
                </span>
              </div>
              <p className="text-muted-foreground mt-1.5 text-[12px] leading-[1.4]">
                {t(option.descKey)}
              </p>
              <div className="mt-3.5">
                <CleanupPreview
                  result={t(option.sampleKey)}
                  selected={selected}
                />
              </div>
            </button>
          );
        })}
      </div>

      {value === "custom" ? (
        <section className="border-border bg-card rounded-[20px] border p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-[58ch]">
              <Eyebrow text={t("models.cleanup.promptLabel")} />
              <p className="text-muted-foreground mt-3 text-[13px] leading-[1.6]">
                {t("models.cleanup.presetHint")}
              </p>
            </div>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={onResetToPreset}
            >
              {t("models.cleanup.resetToPresets")}
            </Button>
          </div>

          <Textarea
            value={cleanupCustomPrompt}
            maxLength={CLEANUP_CUSTOM_PROMPT_MAX}
            onChange={(event) => onCustomPromptChange(event.target.value)}
            spellCheck={false}
            className="mono mt-4 min-h-[190px] resize-y text-[12px] leading-[1.65]"
            aria-label={t("models.cleanup.promptLabel")}
          />

          <div className="text-muted-foreground mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <span>{t("models.cleanup.customHint")}</span>
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
        </section>
      ) : null}
    </div>
  );
}

function SubsetTonePanel<T extends string>({
  destination,
  previewKind,
  title,
  desc,
  apps,
  value,
  options,
  onChange,
  assignments,
  allAssignments,
  onAddAssignment,
  onRemoveAssignment,
}: {
  destination: CleanupToneDestination;
  previewKind: "personal" | "work" | "email" | "overall";
  title: string;
  desc?: string;
  apps: readonly AppMarkId[];
  value: T;
  options: ToneCardOption<T>[];
  onChange: (value: T) => void;
  assignments: CleanupAppAssignment[];
  allAssignments: CleanupAppAssignment[];
  onAddAssignment: (assignment: CleanupAppAssignment) => void;
  onRemoveAssignment: (match: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const canManageRoutes = destination !== "overall";
  const hasRouteIcons = apps.length > 0 || assignments.length > 0;

  const handleOptionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (
        ![
          "ArrowRight",
          "ArrowDown",
          "ArrowLeft",
          "ArrowUp",
          "Home",
          "End",
        ].includes(event.key)
      ) {
        return;
      }

      event.preventDefault();

      if (event.key === "Home") {
        onChange(options[0]!.value);
        return;
      }

      if (event.key === "End") {
        onChange(options.at(-1)!.value);
        return;
      }

      const delta =
        event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (index + delta + options.length) % options.length;
      onChange(options[nextIndex]!.value);
    },
    [onChange, options],
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-5 border-t border-border/70 pt-5 min-[980px]:grid-cols-[minmax(0,1fr)_300px] min-[980px]:items-start">
        <div className="min-w-0">
          <h2 className="text-foreground text-[28px] leading-[1.05] font-medium tracking-[-0.03em]">
            {title}
          </h2>
          {desc ? (
            <p className="text-muted-foreground mt-2 max-w-[52ch] text-[13px] leading-[1.55]">
              {desc}
            </p>
          ) : null}
        </div>
        <div className="min-[980px]:justify-self-end">
          <Eyebrow text={t("tone.routesFrom")} />
          {hasRouteIcons ? (
            <AppMarkRow
              ids={apps}
              assignments={assignments}
              size={30}
              className="mt-3"
              trailing={
                canManageRoutes ? (
                  <AppAssignments
                    destination={destination}
                    items={assignments}
                    allItems={allAssignments}
                    onAdd={onAddAssignment}
                    onRemove={onRemoveAssignment}
                  />
                ) : undefined
              }
            />
          ) : (
            <p className="text-muted-foreground mt-3 text-[12px] leading-[1.5]">
              {t("tone.apps.anyUnlisted")}
            </p>
          )}
          {!hasRouteIcons && canManageRoutes ? (
            <div className="mt-3 flex items-center">
              <AppAssignments
                destination={destination}
                items={assignments}
                allItems={allAssignments}
                onAdd={onAddAssignment}
                onRemove={onRemoveAssignment}
              />
            </div>
          ) : null}
        </div>
      </section>

      <div
        role="radiogroup"
        aria-label={title}
        className="grid grid-cols-1 gap-4 min-[720px]:grid-cols-3"
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          const sample = t(option.sampleKey);

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              className={cn(
                "border-border bg-card rounded-[20px] border p-5 text-left transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
                "hover:border-foreground/20 hover:bg-card/90",
                selected && "border-primary/35 bg-accent/45",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="serif text-foreground text-[29px] leading-none tracking-[-0.04em]">
                    {t(option.titleKey)}
                  </p>
                  <p className="text-muted-foreground mt-3 text-[13px] leading-[1.55]">
                    {t(option.descKey)}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border",
                    selected
                      ? "border-primary/35 bg-primary text-primary-foreground"
                      : "border-border bg-background text-transparent",
                  )}
                >
                  <CheckCircle2 className="size-4" />
                </span>
              </div>

              <div className="mt-6">
                {previewKind === "personal" ? (
                  <TextMessagePreview sample={sample} selected={selected} />
                ) : previewKind === "work" ? (
                  <WorkChatPreview
                    sample={sample}
                    selected={selected}
                    sender={t("tone.work.preview.sender")}
                    time={t("tone.work.preview.time")}
                  />
                ) : previewKind === "email" ? (
                  <EmailPreview
                    body={sample}
                    selected={selected}
                    to={t("tone.email.preview.to")}
                    subject={t("tone.email.preview.subject")}
                  />
                ) : (
                  <NotePreview sample={sample} selected={selected} />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
