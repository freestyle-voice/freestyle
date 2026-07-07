import { Button } from "@renderer/components/ui/button";
import { Toggle } from "@renderer/components/voice-row";
import { cn } from "@renderer/lib/utils";

import { Eyebrow } from "./page-chrome";
import type { ConfiguredModel } from "./types";
import { displayName } from "./utils";

// ---------------------------------------------------------------------------
// PairCard — the current model pair: Voice (required) + cleanup model.
// Side-by-side layout; each "Change" opens the shared model modal. The cleanup
// side owns the on/off switch for post-processing (llm_cleanup).
// ---------------------------------------------------------------------------

export function PairCard({
  voice,
  llm,
  llmCleanup,
  cleanupIncluded,
  onToggleCleanup,
  onChangeVoice,
  onChangeLlm,
  onConfigureWarming,
}: {
  voice: ConfiguredModel | undefined;
  llm: ConfiguredModel | undefined;
  llmCleanup: boolean;
  /** Freestyle Transcribe is active: cleanup always runs and cannot be toggled. */
  cleanupIncluded?: boolean;
  onToggleCleanup: (next: boolean) => void;
  onChangeVoice: () => void;
  onChangeLlm: () => void;
  /** When set, shows a "Configure model warming" link by the voice button. */
  onConfigureWarming?: () => void;
}): React.JSX.Element {
  const warmingAccessory = onConfigureWarming ? (
    <Button
      variant="link"
      size="sm"
      onClick={onConfigureWarming}
      className="ml-auto"
    >
      Configure model warming
    </Button>
  ) : undefined;

  // Freestyle Transcribe handles both transcription and AI cleanup as one
  // service, so collapse the pair into a single panel instead of showing an
  // inert, duplicated "cleanup" side next to it.
  if (cleanupIncluded) {
    return (
      <section className="border-border bg-card rounded-[14px] border p-6">
        <PairSide
          kicker="Transcription + AI cleanup"
          modelName={voice?.model_name ?? "Freestyle Transcribe"}
          providerName={undefined}
          cta="Change"
          primary
          note="Transcription and AI cleanup handled by Freestyle Transcribe."
          onChange={onChangeVoice}
          accessory={warmingAccessory}
        />
      </section>
    );
  }

  return (
    <section className="border-border bg-card grid grid-cols-1 gap-6 rounded-[14px] border p-6 min-[820px]:grid-cols-2">
      <PairSide
        kicker="Transcription · required"
        modelName={voice?.model_name}
        providerName={voice ? displayName(voice.provider) : undefined}
        cta="Change"
        primary
        onChange={onChangeVoice}
        accessory={warmingAccessory}
      />
      <div className="border-border border-t pt-6 min-[820px]:border-l min-[820px]:border-t-0 min-[820px]:pl-6 min-[820px]:pt-0">
        <PairSide
          kicker="AI cleanup · optional"
          modelName={llmCleanup ? llm?.model_name : undefined}
          providerName={
            llmCleanup && llm ? displayName(llm.provider) : undefined
          }
          cta={llm ? "Change" : "Pick a model"}
          toggle={llmCleanup}
          onToggle={onToggleCleanup}
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
  onChange,
  dimmed,
  note,
  accessory,
}: {
  kicker: string;
  modelName: string | undefined;
  providerName: string | undefined;
  cta: string;
  primary?: boolean;
  toggle?: boolean;
  onToggle?: (next: boolean) => void;
  onChange: () => void;
  dimmed?: boolean;
  /** Small caption shown under the model name. */
  note?: React.ReactNode;
  accessory?: React.ReactNode;
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
        {note && (
          <div className="text-muted-foreground mt-1.5 text-[13px]">{note}</div>
        )}
      </div>
      <div className="mt-auto flex items-center gap-2.5 pt-1">
        <Button
          variant={primary ? "ink" : "outline"}
          size="sm"
          onClick={onChange}
        >
          {cta}
        </Button>
        {accessory}
      </div>
    </div>
  );
}
