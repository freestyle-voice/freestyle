import { Toggle } from "@renderer/components/voice-row";
import {
  defaultManualLanguages,
  LANGUAGES,
  type LanguageOption,
  languageLabel,
} from "@renderer/lib/languages";
import { cn } from "@renderer/lib/utils";
import { Check, Search, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function DictationLanguagesField({
  autoDetect,
  languages,
  onSave,
}: {
  autoDetect: boolean;
  languages: string[];
  onSave: (next: { autoDetect: boolean; languages: string[] }) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-secondary text-foreground hover:bg-secondary/80 inline-flex rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-colors"
      >
        Change
      </button>

      <LanguagePickerDialog
        open={open}
        autoDetect={autoDetect}
        languages={languages}
        onOpenChange={setOpen}
        onSave={(next) => {
          onSave(next);
          setOpen(false);
        }}
      />
    </>
  );
}

function LanguagePickerDialog({
  open,
  autoDetect,
  languages,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  autoDetect: boolean;
  languages: string[];
  onOpenChange: (open: boolean) => void;
  onSave: (next: { autoDetect: boolean; languages: string[] }) => void;
}): React.JSX.Element {
  const [draftAutoDetect, setDraftAutoDetect] = useState(autoDetect);
  const [draftLanguages, setDraftLanguages] = useState<string[]>(languages);
  const [query, setQuery] = useState("");
  const manualBeforeAutoRef = useRef<string[]>(languages);

  useEffect(() => {
    if (!open) return;
    setDraftAutoDetect(autoDetect);
    setDraftLanguages(languages);
    manualBeforeAutoRef.current =
      languages.length > 0 ? languages : defaultManualLanguages();
    setQuery("");
  }, [open, autoDetect, languages]);

  const filteredLanguages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return LANGUAGES;
    return LANGUAGES.filter(
      (language) =>
        language.label.toLowerCase().includes(normalized) ||
        language.nativeLabel.toLowerCase().includes(normalized) ||
        language.id.toLowerCase().includes(normalized),
    );
  }, [query]);

  const toggleLanguage = useCallback(
    (id: string) => {
      if (draftAutoDetect) return;
      setDraftLanguages((current) => {
        const next = current.includes(id)
          ? current.filter((languageId) => languageId !== id)
          : [...current, id];
        manualBeforeAutoRef.current =
          next.length > 0 ? next : defaultManualLanguages();
        return next;
      });
    },
    [draftAutoDetect],
  );

  const removeLanguage = useCallback(
    (id: string) => {
      if (draftAutoDetect) return;
      setDraftLanguages((current) => {
        const next = current.filter((languageId) => languageId !== id);
        manualBeforeAutoRef.current =
          next.length > 0 ? next : defaultManualLanguages();
        return next;
      });
    },
    [draftAutoDetect],
  );

  const handleAutoDetectChange = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        if (draftLanguages.length > 0) {
          manualBeforeAutoRef.current = draftLanguages;
        }
        setDraftAutoDetect(true);
        return;
      }
      setDraftAutoDetect(false);
      setDraftLanguages(
        manualBeforeAutoRef.current.length > 0
          ? manualBeforeAutoRef.current
          : defaultManualLanguages(),
      );
    },
    [draftLanguages],
  );

  const handleSave = useCallback(() => {
    if (draftAutoDetect) {
      onSave({ autoDetect: true, languages: manualBeforeAutoRef.current });
      return;
    }
    const nextLanguages =
      draftLanguages.length > 0 ? draftLanguages : defaultManualLanguages();
    manualBeforeAutoRef.current = nextLanguages;
    onSave({ autoDetect: false, languages: nextLanguages });
  }, [draftAutoDetect, draftLanguages, onSave]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content className="border-border bg-card fixed top-1/2 left-1/2 z-50 flex max-h-[min(680px,calc(100vh-2rem))] w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[14px] border shadow-xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="border-border border-b px-6 pt-6 pb-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogPrimitive.Title className="serif text-foreground m-0 text-[32px] font-normal leading-[0.95] tracking-[-0.025em]">
                  <span className="serif-italic text-primary">Languages</span>
                  <span>. </span>
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-muted-foreground mt-2 text-[13px] leading-[1.5]">
                  Tell Freestyle which languages to expect when you dictate.
                </DialogPrimitive.Description>
              </div>
              <div className="flex shrink-0 items-center gap-3 pt-1">
                <label className="text-muted-foreground flex items-center gap-2 text-[12.5px]">
                  Auto-detect
                  <Toggle
                    on={draftAutoDetect}
                    onChange={handleAutoDetectChange}
                  />
                </label>
                <DialogPrimitive.Close className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1">
                  <X size={16} />
                </DialogPrimitive.Close>
              </div>
            </div>

            {!draftAutoDetect && draftLanguages.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {draftLanguages.map((id) => (
                  <LanguageChip
                    key={id}
                    id={id}
                    onRemove={() => removeLanguage(id)}
                  />
                ))}
              </div>
            )}

            {draftAutoDetect && manualBeforeAutoRef.current.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {manualBeforeAutoRef.current.map((id) => (
                  <LanguageChip key={id} id={id} muted />
                ))}
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-border border-b px-6 py-3">
              <div className="border-border bg-background text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px]">
                <Search size={14} className="shrink-0" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter languages"
                  disabled={draftAutoDetect}
                  className="text-foreground placeholder:text-muted-foreground/80 w-full bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto px-2 py-2",
                draftAutoDetect && "opacity-45",
              )}
            >
              {draftAutoDetect && (
                <p className="text-muted-foreground px-4 pt-2 pb-3 text-[12.5px] leading-[1.5]">
                  Auto-detect is on. Turn it off to pick specific languages —
                  your last choices will come back.
                </p>
              )}
              <div className="flex flex-col">
                {filteredLanguages.map((language, index) => (
                  <LanguageRow
                    key={language.id}
                    language={language}
                    selected={draftLanguages.includes(language.id)}
                    disabled={draftAutoDetect}
                    isLast={index === filteredLanguages.length - 1}
                    onToggle={() => toggleLanguage(language.id)}
                  />
                ))}
              </div>
              {filteredLanguages.length === 0 && (
                <p className="text-muted-foreground px-4 py-8 text-center text-sm">
                  No languages match your search.
                </p>
              )}
            </div>
          </div>

          <div className="border-border flex justify-end gap-2 border-t px-6 py-4">
            <DialogPrimitive.Close className="border-border text-secondary-foreground/80 hover:text-foreground cursor-pointer rounded-md border px-3 py-1.5 text-[12.5px] font-medium">
              Cancel
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={handleSave}
              className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer rounded-md px-3 py-1.5 text-[12.5px] font-medium"
            >
              Save
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function LanguageChip({
  id,
  muted,
  onRemove,
}: {
  id: string;
  muted?: boolean;
  onRemove?: () => void;
}): React.JSX.Element {
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
        muted
          ? "border-border/70 bg-background/60 text-muted-foreground"
          : "border-primary/30 bg-primary/8 text-foreground",
      )}
    >
      {languageLabel(id)}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground cursor-pointer rounded-sm"
          aria-label={`Remove ${languageLabel(id)}`}
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}

function LanguageRow({
  language,
  selected,
  disabled,
  isLast,
  onToggle,
}: {
  language: LanguageOption;
  selected: boolean;
  disabled: boolean;
  isLast: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
        !disabled && "hover:bg-background/70",
        disabled && "cursor-not-allowed",
        !isLast && "border-border/60 border-b",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-foreground text-[14px] font-medium">
          {language.label}
        </div>
        <div className="text-muted-foreground mt-0.5 text-[12px]">
          {language.nativeLabel}
        </div>
      </div>
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background",
        )}
      >
        {selected && <Check size={12} strokeWidth={2.5} />}
      </span>
    </button>
  );
}
