import { Cpu } from "lucide-react";

import { MAX_MLX_KEEP_ALIVE_MINUTES } from "./constants";
import { Eyebrow } from "./page-chrome";

function mlxKeepAliveDescription(minutes: number): string {
  if (minutes === 0) {
    return "Unload the model from memory after each transcription. Uses less RAM, but the next dictation waits for a full reload.";
  }
  if (minutes === 1) {
    return "Keep the model in memory for about 1 minute after you finish dictating, so quick follow-ups stay fast.";
  }
  return `Keep the model loaded in memory for up to ${minutes} minutes after dictation. Faster repeat use, more RAM while warm.`;
}

export function MlxMemorySection({
  keepAliveMinutes,
  serverRunning,
  blockedReason,
  onChange,
}: {
  keepAliveMinutes: number;
  serverRunning: boolean;
  blockedReason: string | null;
  onChange: (minutes: number) => void;
}): React.JSX.Element {
  const valueLabel =
    keepAliveMinutes === 0 ? "Cold start" : `${keepAliveMinutes} min`;
  const fillPercent = (keepAliveMinutes / MAX_MLX_KEEP_ALIVE_MINUTES) * 100;

  return (
    <section className="border-border bg-card rounded-[14px] border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Cpu className="text-primary h-3.5 w-3.5 shrink-0" />
          <Eyebrow text="Model warming" accent />
          {serverRunning && (
            <span className="bg-primary/10 text-primary mono rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]">
              Loaded
            </span>
          )}
        </div>
        <span className="border-border bg-background rounded-md border px-2.5 py-1 text-[12px] font-medium">
          {valueLabel}
        </span>
      </div>

      <p className="text-muted-foreground mt-3 text-[12px] leading-relaxed">
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
    </section>
  );
}
