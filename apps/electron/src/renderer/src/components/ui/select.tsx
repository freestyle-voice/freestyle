import { cn } from "@renderer/lib/utils";
import { ChevronDown } from "lucide-react";
import * as React from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[] | SelectOption[];
  icon?: React.ReactNode;
  className?: string;
  id?: string;
}

export function Select({
  value,
  onChange,
  options,
  icon,
  className,
  id,
}: SelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", className)}
      id={id}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="border-border bg-card text-foreground flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm text-left outline-none cursor-pointer select-none transition-colors hover:bg-secondary/40 focus:border-primary/60"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon}
          <span className="truncate">
            {selectedOption ? selectedOption.label : value}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200",
            isOpen && "transform rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div className="border-border bg-card shadow-lg absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border py-1 z-50 animate-in fade-in-50 slide-in-from-top-1 duration-100">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={cn(
                "hover:bg-secondary/80 flex w-full items-center px-3 py-2 text-sm text-left cursor-pointer transition-colors outline-none",
                option.value === value
                  ? "text-primary font-medium bg-primary/[0.04]"
                  : "text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
