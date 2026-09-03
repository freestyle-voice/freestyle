/**
 * Searchable transcription-language picker.
 *
 * Sources its options from the cloud `suggestedLanguages` (the full
 * Soniox-supported set, pre-sorted for the user's region) and falls back to the
 * small bundled list when offline / signed out. Two presentations share the same
 * searchable list body:
 *
 *   - {@link LanguageCombobox} — a Select-like trigger + popover, for settings.
 *   - {@link LanguagePickerDialog} — a modal "See all" list, for onboarding.
 */

import type { SuggestedLanguage } from "@freestyle-voice/validations";
import {
  filterLanguageOptions,
  type LanguageChoice,
  MAX_LANGUAGES,
  resolveLanguageOptions,
} from "@freestyle-voice/validations";
import { Button } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { Input } from "@renderer/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@renderer/components/ui/popover";
import { LANGUAGES } from "@renderer/lib/languages";
import { cn } from "@renderer/lib/utils";
import { Check, Languages, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/** Local fallback options (used when the cloud config is unavailable). */
function useLocalFallback(): LanguageChoice[] {
  const { t } = useTranslation();
  return useMemo(
    () => [
      {
        code: "auto",
        label:
          t("settings.recording.transcriptionLanguages.auto") || "Auto-detect",
      },
      ...LANGUAGES.map((l) => ({
        code: l.id,
        label:
          t(`settings.recording.transcriptionLanguages.${l.id}`) || l.label,
      })),
    ],
    [t],
  );
}

/** Resolve the ordered option list from cloud suggestions + local fallback. */
export function useLanguageOptions(
  suggested: SuggestedLanguage[] | undefined,
): LanguageChoice[] {
  const fallback = useLocalFallback();
  return useMemo(
    () => resolveLanguageOptions(suggested, fallback),
    [suggested, fallback],
  );
}

/** The scrollable, filterable list of language rows shared by both surfaces. */
function LanguageList({
  options,
  selectedCodes,
  onSelect,
  autoFocus,
}: {
  options: LanguageChoice[];
  /** Codes shown as selected (checked). */
  selectedCodes: readonly string[];
  onSelect: (code: string) => void;
  autoFocus?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => filterLanguageOptions(options, query),
    [options, query],
  );

  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            t("settings.recording.languageSearchPlaceholder") ||
            "Search languages…"
          }
          className="pl-8"
          aria-label={
            t("settings.recording.languageSearchPlaceholder") ||
            "Search languages"
          }
        />
      </div>
      <div
        className="flex max-h-72 flex-col overflow-y-auto"
        role="listbox"
        aria-label={t("settings.recording.language") || "Language"}
      >
        {filtered.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-sm">
            {t("common.noResults") || "No languages found"}
          </p>
        ) : (
          filtered.map((lang) => {
            const active = selectedSet.has(lang.code);
            return (
              <button
                key={lang.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelect(lang.code)}
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  active && "font-medium text-primary",
                )}
              >
                <span>{lang.label}</span>
                {active ? <Check className="size-4 shrink-0" /> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Modal "See all languages" dialog in multi-select mode (onboarding). Toggling
 * a row adds/removes it; the dialog stays open so several can be picked. Capped
 * at {@link MAX_LANGUAGES}.
 */
export function LanguageMultiPickerDialog({
  open,
  onOpenChange,
  values,
  onToggle,
  options,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: string[];
  onToggle: (code: string) => void;
  options: LanguageChoice[];
}): React.JSX.Element {
  const { t } = useTranslation();
  const atCap = values.length >= MAX_LANGUAGES;
  const pickable = useMemo(
    () => options.filter((o) => o.code !== "auto"),
    [options],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t("onboarding.language.allLanguages") || "All languages"}
          </DialogTitle>
        </DialogHeader>
        <LanguageList
          options={pickable}
          selectedCodes={values}
          autoFocus
          onSelect={(code) => {
            // Block adding beyond the cap; always allow removing.
            if (!values.includes(code) && atCap) return;
            onToggle(code);
          }}
        />
        {atCap ? (
          <p className="text-muted-foreground px-1 text-xs">
            {t("settings.recording.languageMax", { count: MAX_LANGUAGES }) ||
              `Up to ${MAX_LANGUAGES} languages.`}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Removable-pill multi-language selector (settings + onboarding).
 *
 * Renders each selected language as a pill with a remove (×) affordance, plus
 * an "add" button that opens a searchable popover to toggle languages on/off.
 * An empty selection means auto-detect and shows a hint pill. The number of
 * languages is capped at {@link MAX_LANGUAGES} (cloud parity); once reached, the
 * add button is disabled.
 */
export function LanguageMultiSelect({
  values,
  onChange,
  options,
  id,
  className,
}: {
  /** Selected ISO codes (never includes the "auto" sentinel). */
  values: string[];
  onChange: (codes: string[]) => void;
  options: LanguageChoice[];
  id?: string;
  className?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const labelFor = (code: string): string =>
    options.find((o) => o.code === code)?.label ?? code;

  // "auto" is only a picker affordance, not a stored value.
  const pickable = useMemo(
    () => options.filter((o) => o.code !== "auto"),
    [options],
  );

  const atCap = values.length >= MAX_LANGUAGES;

  // The picker list excludes "auto", so `toggle` only ever sees real codes.
  const toggle = (code: string): void => {
    if (values.includes(code)) {
      onChange(values.filter((c) => c !== code));
    } else if (!atCap) {
      onChange([...values, code]);
    }
  };

  const remove = (code: string): void => {
    onChange(values.filter((c) => c !== code));
  };

  return (
    <div id={id} className={cn("flex flex-wrap items-center gap-2", className)}>
      {values.length === 0 ? (
        <span className="text-muted-foreground bg-muted/40 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm">
          <Languages className="size-3.5 shrink-0" />
          {t("settings.recording.languageAutoPill") || "Auto-detect"}
        </span>
      ) : (
        values.map((code) => (
          <span
            key={code}
            className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm"
          >
            {labelFor(code)}
            <button
              type="button"
              onClick={() => remove(code)}
              aria-label={
                t("settings.recording.languageRemove", {
                  language: labelFor(code),
                }) || `Remove ${labelFor(code)}`
              }
              className="hover:bg-background/60 focus-visible:ring-ring inline-flex size-5 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={atCap}
            className="h-7 gap-1 rounded-full px-3"
            aria-label={t("settings.recording.languageAdd") || "Add language"}
          >
            <Plus className="size-3.5" />
            {t("settings.recording.languageAdd") || "Add language"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <LanguageList
            options={pickable}
            selectedCodes={values}
            autoFocus
            onSelect={toggle}
          />
          {atCap ? (
            <p className="text-muted-foreground px-2 pt-2 text-xs">
              {t("settings.recording.languageMax", { count: MAX_LANGUAGES }) ||
                `Up to ${MAX_LANGUAGES} languages.`}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
