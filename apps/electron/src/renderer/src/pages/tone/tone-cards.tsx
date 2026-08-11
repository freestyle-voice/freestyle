import { cn } from "@renderer/lib/utils";
import { Check } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { ToneCardOption } from "./options";

const ARROW_KEYS = [
  "ArrowRight",
  "ArrowDown",
  "ArrowLeft",
  "ArrowUp",
  "Home",
  "End",
];

/**
 * The option picker used by Strength and by every destination page.
 *
 * Previously this existed twice — a horizontal 4-across grid on the Cleanup
 * tab and a vertical stack on the other four — for no reason anyone could
 * name. One responsive grid now serves both.
 */
export function ToneCards<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly ToneCardOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (!ARROW_KEYS.includes(event.key)) return;
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
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled}
      className={cn(
        "grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: roving-tabindex radiogroup on styled buttons; <input type="radio"> would need a full restyle of the card layout.
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            tabIndex={disabled ? -1 : selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "group border-border bg-card relative flex flex-col gap-1.5 overflow-hidden rounded-[14px] border py-3.5 pr-3.5 pl-5 text-left transition-all duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
              "hover:border-foreground/20 hover:bg-card/90",
              selected && "border-primary/40 bg-accent/45",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full transition-all duration-150",
                selected
                  ? "bg-primary h-9"
                  : "bg-foreground/15 h-0 group-hover:h-5",
              )}
            />
            <div className="flex items-center justify-between gap-1.5">
              <p className="serif text-foreground text-[21px] leading-none tracking-[-0.03em]">
                {t(option.titleKey)}
              </p>
              <span
                className={cn(
                  "flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/70 bg-transparent text-transparent group-hover:border-foreground/25",
                )}
              >
                <Check
                  className="size-2.5"
                  strokeWidth={3}
                  aria-hidden="true"
                />
              </span>
            </div>
            <p className="text-muted-foreground text-[11.5px] leading-[1.4]">
              {t(option.descKey)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
