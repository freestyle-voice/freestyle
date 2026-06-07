import { Cpu } from "lucide-react";

import { MAX_MLX_KEEP_ALIVE_MINUTES } from "./constants";

function mlxKeepAliveDescription(minutes: number): string {
  if (minutes === 0) {
    return "Unload the model from memory after each transcription. Uses less RAM, but the next dictation waits for a full reload.";
  }
  if (minutes === 1) {
    return "Keep the model in memory for about 1 minute after you finish dictating, so quick follow-ups stay fast.";
  }
  return `Keep the model loaded in memory for up to ${minutes} minutes after dictation. Faster repeat use, more RAM while warm.`;
}

// ---------------------------------------------------------------------------
// MlxWarmingDialog — modal to configure the MLX keep-alive (cold start ↔ warm)
// ---------------------------------------------------------------------------

export function MlxWarmingDialog({
  keepAliveMinutes,
  blockedReason,
  onChange,
  onClose,
}: {
  keepAliveMinutes: number;
  blockedReason: string | null;
  onChange: (minutes: number) => void;
  onClose: () => void;
}): React.JSX.Element {
  const fillPercent = (keepAliveMinutes / MAX_MLX_KEEP_ALIVE_MINUTES) * 100;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,12,4,0.35)] p-6 backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Model warming"
        className="border-border bg-card w-full max-w-md rounded-[14px] border p-7 shadow-[0_24px_60px_-16px_rgba(20,12,4,0.4)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Cpu className="text-primary h-4 w-4 shrink-0" />
          <h3 className="text-foreground m-0 text-[17px] font-semibold">
            Model warming
          </h3>
        </div>

        <p className="text-muted-foreground mt-3 text-[12.5px] leading-relaxed">
          {mlxKeepAliveDescription(keepAliveMinutes)}
        </p>

        <div className="mt-4">
          <input
            type="range"
            min={0}
            max={MAX_MLX_KEEP_ALIVE_MINUTES}
            step={1}
            value={keepAliveMinutes}
            onChange={(event) => onChange(Number(event.currentTarget.value))}
            style={{
              background: `linear-gradient(to right, var(--primary) ${fillPercent}%, var(--secondary) ${fillPercent}%)`,
            }}
            className="h-2 w-full appearance-none rounded-full outline-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_var(--card)]"
            aria-label="MLX ASR keep-alive minutes"
          />
          <div className="text-muted-foreground mt-2 flex justify-between text-[11px]">
            <span>Cold start (unload)</span>
            <span>Keep warm 10 min</span>
          </div>
        </div>

        {blockedReason && (
          <p className="text-destructive mt-3 text-[12px] leading-relaxed">
            {blockedReason}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-3.5 py-1.5 text-[12.5px] font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
