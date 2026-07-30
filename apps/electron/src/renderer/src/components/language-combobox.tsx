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
import { Check, Languages, Search } from "lucide-react";
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
  value,
  onSelect,
  autoFocus,
}: {
  options: LanguageChoice[];
  value: string;
  onSelect: (code: string) => void;
  autoFocus?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => filterLanguageOptions(options, query),
    [options, query],
  );

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
            const active = lang.code === value;
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

/** Select-like trigger + popover with a searchable language list (settings). */
export function LanguageCombobox({
  value,
  onChange,
  options,
  id,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  options: LanguageChoice[];
  id?: string;
  className?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full max-w-md justify-start font-normal", className)}
        >
          <Languages className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate">{selected?.label ?? value}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) max-w-md p-2"
      >
        <LanguageList
          options={options}
          value={value}
          autoFocus
          onSelect={(code) => {
            onChange(code);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Modal "See all languages" dialog with a searchable list (onboarding). */
export function LanguagePickerDialog({
  open,
  onOpenChange,
  value,
  onChange,
  options,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (code: string) => void;
  options: LanguageChoice[];
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t("onboarding.language.allLanguages") || "All languages"}
          </DialogTitle>
        </DialogHeader>
        <LanguageList
          options={options}
          value={value}
          autoFocus
          onSelect={(code) => {
            onChange(code);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
