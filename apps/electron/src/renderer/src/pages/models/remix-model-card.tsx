import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import { Cloud, Sparkles } from "lucide-react";
import type React from "react";

import type { ConfiguredModel } from "./types";
import { displayName } from "./utils";

/**
 * Remix has its own model role: a selected personal model runs and persists
 * locally; Freestyle Cloud leaves the existing managed session path intact.
 */
export function RemixModelCard({
  model,
  busy,
  onChooseModel,
  onUseCloud,
}: {
  model: ConfiguredModel | undefined;
  busy?: boolean;
  onChooseModel: () => void;
  onUseCloud: () => void;
}): React.JSX.Element {
  const local = !!model && model.provider !== "freestyle-cloud";
  return (
    <section
      className="border-border bg-card/55 flex flex-col gap-4 rounded-[12px] border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
      data-testid="remix-model-configuration"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {local ? (
            <Sparkles className="text-primary h-4 w-4 shrink-0" />
          ) : (
            <Cloud className="text-primary h-4 w-4 shrink-0" />
          )}
          <p className="text-foreground truncate text-[16px] font-semibold tracking-[-0.012em]">
            {local ? model.model_name : "Freestyle Cloud"}
          </p>
        </div>
        <p className="text-muted-foreground mt-1 text-[12px] leading-[1.5]">
          {local
            ? `${displayName(model.provider)} · sessions stay on this device`
            : "Cloud sessions stay synced across your devices"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {local && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onUseCloud}
            disabled={busy}
            className={cn("text-muted-foreground hover:text-foreground")}
          >
            Use Cloud
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onChooseModel}>
          {local ? "Change model" : "Choose a model"}
        </Button>
      </div>
    </section>
  );
}
