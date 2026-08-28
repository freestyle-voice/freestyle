import { Button } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { Slider } from "@renderer/components/ui/slider";
import { Cpu } from "lucide-react";

import { MAX_MLX_KEEP_ALIVE_MINUTES, MLX_KEEP_ALIVE_ALWAYS } from "./constants";

function mlxKeepAliveDescription(minutes: number): string {
  if (minutes === MLX_KEEP_ALIVE_ALWAYS) {
    return "Keep the model loaded in memory at all times, until you quit Freestyle. Fastest repeat use, uses the most RAM.";
  }
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
  // The slider gets one extra step past the max minutes to represent "Always on".
  const alwaysPos = MAX_MLX_KEEP_ALIVE_MINUTES + 1;
  const sliderPos =
    keepAliveMinutes === MLX_KEEP_ALIVE_ALWAYS ? alwaysPos : keepAliveMinutes;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex min-w-0 items-center gap-2.5">
            <Cpu className="text-primary h-4 w-4 shrink-0" />
            <DialogTitle>Model warming</DialogTitle>
          </div>
        </DialogHeader>

        <p className="text-muted-foreground text-[12.5px] leading-relaxed">
          {mlxKeepAliveDescription(keepAliveMinutes)}
        </p>

        <div>
          <Slider
            value={[sliderPos]}
            onValueChange={([v]) =>
              onChange(
                v > MAX_MLX_KEEP_ALIVE_MINUTES ? MLX_KEEP_ALIVE_ALWAYS : v,
              )
            }
            min={0}
            max={alwaysPos}
            step={1}
            aria-label="MLX ASR keep-alive"
          />
          <div className="text-muted-foreground mt-2 flex justify-between text-[11px]">
            <span>Cold start (unload)</span>
            <span>Always on</span>
          </div>
        </div>

        {blockedReason && (
          <p className="text-destructive text-[12px] leading-relaxed">
            {blockedReason}
          </p>
        )}

        <DialogFooter>
          <Button variant="ink" size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
