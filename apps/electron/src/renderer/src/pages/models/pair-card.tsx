import { Toggle } from "@renderer/components/voice-row";
import { cn } from "@renderer/lib/utils";

import { Eyebrow } from "./page-chrome";
import type { ConfiguredModel, PickerType } from "./types";
import { displayName } from "./utils";

// ---------------------------------------------------------------------------
// PairCard — the "current pair" hero: Voice (required) + LLM cleanup (optional)
// ---------------------------------------------------------------------------

export function PairCard({
  voice,
  llm,
  llmCleanup,
  onToggleCleanup,
  onChangeVoice,
  onChangeLlm,
  pickerOpen,
}: {
  voice: ConfiguredModel | undefined;
  llm: ConfiguredModel | undefined;
  llmCleanup: boolean;
  onToggleCleanup: (next: boolean) => void;
  onChangeVoice: () => void;
  onChangeLlm: () => void;
  pickerOpen: PickerType;
}): React.JSX.Element {
  return (
    <section className="border-border bg-card grid grid-cols-1 gap-6 rounded-[14px] border p-6 min-[820px]:grid-cols-2">
      <PairSide
        kicker="Voice model · required"
        modelName={voice?.model_name}
        providerName={voice ? displayName(voice.provider) : undefined}
        cta="Change"
        primary
        active={pickerOpen === "voice"}
        onChange={onChangeVoice}
      />
      <div className="border-border border-t pt-6 min-[820px]:border-l min-[820px]:border-t-0 min-[820px]:pl-6 min-[820px]:pt-0">
        <PairSide
          kicker="Post-processing model · optional"
          modelName={llmCleanup ? llm?.model_name : undefined}
          providerName={
            llmCleanup && llm ? displayName(llm.provider) : undefined
          }
          cta={llm ? "Change" : "Pick a model"}
          toggle={llmCleanup}
          onToggle={onToggleCleanup}
          active={pickerOpen === "llm"}
          onChange={onChangeLlm}
          dimmed={!llmCleanup}
        />
      </div>
    </section>
  );
}

function PairSide({
  kicker,
  modelName,
  providerName,
  cta,
  primary,
  toggle,
  onToggle,
  active,
  onChange,
  dimmed,
}: {
  kicker: string;
  modelName: string | undefined;
  providerName: string | undefined;
  cta: string;
  primary?: boolean;
  toggle?: boolean;
  onToggle?: (next: boolean) => void;
  active?: boolean;
  onChange: () => void;
  dimmed?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-3 transition-opacity",
        dimmed && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between">
        <Eyebrow text={kicker} accent={primary} mono={false} />
        {onToggle !== undefined && (
          <Toggle on={!!toggle} onChange={(v) => onToggle(v)} />
        )}
      </div>
      <div>
        {modelName ? (
          <div
            className="serif text-foreground"
            style={{
              fontSize: 34,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              fontWeight: 400,
            }}
          >
            {modelName}
          </div>
        ) : (
          <div
            className="serif-italic text-muted-foreground"
            style={{ fontSize: 30, lineHeight: 1.1 }}
          >
            None selected
          </div>
        )}
        {providerName && (
          <div className="text-muted-foreground mt-1.5 text-[13px]">
            via{" "}
            <span className="text-foreground/80 font-medium">
              {providerName}
            </span>
          </div>
        )}
      </div>
      <div className="mt-auto flex items-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={onChange}
          className={cn(
            "rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
            primary
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "border-border hover:bg-secondary border",
            active && "ring-primary/30 ring-2",
          )}
        >
          {cta}
        </button>
      </div>
    </div>
  );
}
