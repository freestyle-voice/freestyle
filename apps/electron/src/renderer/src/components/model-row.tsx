import { cn } from "@renderer/lib/utils";
import { Check, Key, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export const PROVIDER_FILTER_MARKS: Record<string, string> = {
  openai: "OAI",
  openrouter: "OR",
  together: "T",
  fireworks: "FW",
  anthropic: "A",
  google: "G",
  groq: "GQ",
  mistral: "M",
};

export const MODEL_ROW_PAGE_SIZE = 20;

export function ProviderModelHeader({
  providerId,
  providerName,
  hasKey,
}: {
  providerId: string;
  providerName: string;
  hasKey: boolean;
}): React.JSX.Element {
  return (
    <div className="border-border bg-card text-muted-foreground sticky top-0 z-10 flex items-center gap-1.5 border-b px-5 py-1.5 text-[10px] font-semibold uppercase tracking-wider">
      {PROVIDER_FILTER_MARKS[providerId] && (
        <span
          className="border-current/35 inline-flex h-4 min-w-4 items-center justify-center rounded-full border px-1 text-[8px] font-semibold leading-none"
          aria-hidden="true"
        >
          {PROVIDER_FILTER_MARKS[providerId]}
        </span>
      )}
      <span>{providerName}</span>
      {!hasKey && (
        <span className="text-destructive ml-2 normal-case tracking-normal">
          (no API key)
        </span>
      )}
    </div>
  );
}

export function LlmModelRow({
  name,
  providerName,
  modelId,
  selected,
  hasKey,
  first,
  onSelect,
}: {
  name: string;
  providerName: string;
  modelId: string;
  selected: boolean;
  hasKey: boolean;
  first: boolean;
  onSelect?: () => void;
}): React.JSX.Element {
  const ghostBtn =
    "border-border hover:bg-secondary flex items-center gap-1.5 rounded-[8px] border px-3 py-2 text-[12.5px] font-medium";
  const solidBtn =
    "bg-foreground text-background hover:bg-foreground/90 rounded-[8px] px-3.5 py-2 text-[12.5px] font-medium";

  return (
    <div
      className={cn(
        "group grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4",
        !first && "border-border border-t",
        selected && "bg-primary/[0.06]",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground min-w-0 truncate text-[14px] font-semibold">
            {name}
          </span>
          <span className="text-muted-foreground whitespace-nowrap text-[12px]">
            {providerName}
          </span>
          {selected && <Check size={15} className="text-primary" />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 text-[11.5px]">
                <Sparkles className="h-3 w-3 shrink-0" />
                <span className="min-w-0 truncate">{modelId}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Model identifier</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 justify-self-end">
        {selected ? (
          <span
            className="mono text-primary"
            style={{ fontSize: 10, letterSpacing: "0.14em" }}
          >
            SELECTED
          </span>
        ) : hasKey ? (
          <button type="button" onClick={onSelect} className={solidBtn}>
            Use
          </button>
        ) : (
          <button type="button" onClick={onSelect} className={ghostBtn}>
            <Key size={12} />
            Add key
          </button>
        )}
      </div>
    </div>
  );
}

export function ShowMoreModelRowsButton({
  hiddenCount,
  onClick,
}: {
  hiddenCount: number;
  onClick: () => void;
}): React.JSX.Element | null {
  if (hiddenCount <= 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground hover:bg-secondary hover:text-foreground flex w-full items-center justify-center border-t border-border px-5 py-3 text-[12.5px] font-medium"
    >
      Show {Math.min(hiddenCount, MODEL_ROW_PAGE_SIZE)} more
      {hiddenCount > MODEL_ROW_PAGE_SIZE ? ` (${hiddenCount} hidden)` : ""}
    </button>
  );
}
