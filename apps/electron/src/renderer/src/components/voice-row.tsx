import type { AvailableModel, VoiceItem } from "@renderer/lib/models";
import { formatBytes, formatSpeed } from "@renderer/lib/models";
import { cn } from "@renderer/lib/utils";
import {
  Check,
  CircleDollarSign,
  Download,
  Key,
  RefreshCw,
  Target,
  Trash2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function Meter({ value }: { value?: number }): React.JSX.Element | null {
  if (value == null) return null;
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            "h-[5px] w-[5px] rounded-full",
            i <= value ? "bg-primary" : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

export function StatPair({
  icon: Icon,
  label,
  accent,
}: {
  icon: typeof Zap;
  label: string;
  accent?: boolean;
}): React.JSX.Element {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px]">
      <Icon className={cn("h-3 w-3", accent ? "text-primary" : "")} />
      {label}
    </span>
  );
}

export function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-[22px] w-10 shrink-0 rounded-full border transition-colors",
        on ? "bg-primary border-primary/80" : "bg-secondary border-border",
      )}
      aria-pressed={on}
    >
      <span
        className={cn(
          "absolute top-[1px] block h-[18px] w-[18px] rounded-full transition-transform",
          on ? "bg-primary-foreground" : "bg-muted-foreground/70",
        )}
        style={{ transform: on ? "translateX(19px)" : "translateX(2px)" }}
      />
    </button>
  );
}

export function VoiceRow({
  item,
  first,
  onSelectCloud,
  onSelectLocal,
  onDownload,
  onRetryLocal,
  onCancel,
  onDelete,
}: {
  item: VoiceItem;
  first: boolean;
  onSelectCloud: (m: AvailableModel) => void;
  onSelectLocal: (
    defId: string,
    name: string,
    engine?: "whisper" | "mlx",
  ) => void;
  onDownload: (defId: string, engine?: "whisper" | "mlx") => void;
  onRetryLocal?: (defId: string, engine: "whisper" | "mlx") => void;
  onCancel?: (defId: string, engine?: "whisper" | "mlx") => void;
  onDelete?: (defId: string, engine?: "whisper" | "mlx") => void;
}): React.JSX.Element {
  const local = item.kind === "local";
  const status = item.status ?? "not_downloaded";
  const selectedReady = item.selected && (!local || status === "ready");
  const downloading =
    local && (status === "downloading" || status === "verifying");
  const hasProgress = !!item.state?.downloadProgress;
  const isSetupError =
    item.localEngine === "mlx" &&
    !!item.state?.error &&
    /(not installed|not found|missing|FREESTYLE|Python)/i.test(
      item.state.error,
    );
  const ghostBtn =
    "border-border hover:bg-secondary flex items-center gap-1.5 rounded-[8px] border px-3 py-2 text-[12.5px] font-medium";
  const solidBtn =
    "bg-foreground text-background hover:bg-foreground/90 rounded-[8px] px-3.5 py-2 text-[12.5px] font-medium";

  return (
    <div
      className={cn(
        "group grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4",
        !first && "border-border border-t",
        selectedReady && "bg-primary/[0.06]",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground whitespace-nowrap text-[14px] font-semibold">
            {item.name}
          </span>
          <span className="text-muted-foreground whitespace-nowrap text-[12px]">
            {item.provider}
          </span>
          {selectedReady && <Check size={15} className="text-primary" />}
          {item.note && (
            <span className="text-primary whitespace-nowrap text-[11px] font-medium">
              {item.note}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-4">
          {item.speed != null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5">
                  <Zap className="text-muted-foreground h-3 w-3" />
                  <Meter value={item.speed} />
                </span>
              </TooltipTrigger>
              <TooltipContent>Speed</TooltipContent>
            </Tooltip>
          )}
          {item.quality != null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5">
                  <Target className="text-muted-foreground h-3 w-3" />
                  <Meter value={item.quality} />
                </span>
              </TooltipTrigger>
              <TooltipContent>Quality</TooltipContent>
            </Tooltip>
          )}
          {local ? (
            item.sizeBytes != null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <StatPair
                      icon={Download}
                      label={formatBytes(item.sizeBytes)}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Download size</TooltipContent>
              </Tooltip>
            )
          ) : (
            <>
              {item.cost != null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <StatPair
                        icon={CircleDollarSign}
                        label={`$${item.cost.toFixed(2)}/hr`}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Estimated cost</TooltipContent>
                </Tooltip>
              )}
              {item.streaming && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <StatPair icon={Wifi} label="Streaming" accent />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Real-time streaming</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </div>

        {local && status === "error" && item.state?.error && (
          <div className="text-destructive mt-1.5 text-[11.5px] leading-snug">
            {item.state.error}
          </div>
        )}

        {downloading && (
          <div className="mt-2.5 space-y-1">
            <div className="bg-secondary h-[5px] w-full overflow-hidden rounded-full">
              {!hasProgress ? (
                <div className="bg-primary h-full w-full animate-pulse rounded-full" />
              ) : (
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{
                    width: `${item.state?.downloadProgress?.percent ?? 0}%`,
                  }}
                />
              )}
            </div>
            <div className="text-muted-foreground mono flex justify-between text-[10px]">
              {item.state?.phase === "building_binary" && hasProgress ? (
                <>
                  <span>
                    MLX runtime ·{" "}
                    {formatBytes(item.state.downloadProgress!.bytesDownloaded)}{" "}
                    / {formatBytes(item.state.downloadProgress!.bytesTotal)}
                  </span>
                  <span>
                    {item.state.downloadProgress!.speedBps > 0 &&
                      formatSpeed(item.state.downloadProgress!.speedBps)}
                    {item.state.downloadProgress!.percent > 0 &&
                      ` \u00b7 ${item.state.downloadProgress!.percent}%`}
                  </span>
                </>
              ) : item.state?.phase === "building_binary" ? (
                <span>
                  {item.localEngine === "mlx"
                    ? "Downloading MLX runtime..."
                    : "Building whisper.cpp, this may take a minute..."}
                </span>
              ) : item.state?.downloadProgress ? (
                <>
                  <span>
                    {formatBytes(item.state.downloadProgress.bytesDownloaded)} /{" "}
                    {formatBytes(item.state.downloadProgress.bytesTotal)}
                  </span>
                  <span>
                    {item.state.downloadProgress.speedBps > 0 &&
                      formatSpeed(item.state.downloadProgress.speedBps)}
                    {item.state.downloadProgress.percent > 0 &&
                      ` \u00b7 ${item.state.downloadProgress.percent}%`}
                  </span>
                </>
              ) : (
                <span>
                  {item.localEngine === "mlx"
                    ? "Downloading model weights..."
                    : "Verifying..."}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 justify-self-end">
        {selectedReady ? (
          <span
            className="mono text-primary"
            style={{ fontSize: 10, letterSpacing: "0.14em" }}
          >
            SELECTED
          </span>
        ) : local ? (
          <>
            {status === "ready" && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    item.defId &&
                    onSelectLocal(item.defId, item.name, item.localEngine)
                  }
                  className={solidBtn}
                >
                  Use
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={() =>
                      item.defId && onDelete(item.defId, item.localEngine)
                    }
                    className="border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 flex items-center gap-1 rounded-[8px] border px-2.5 py-2 text-[12px] font-medium transition-colors"
                    title="Remove downloaded model from disk"
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                )}
              </>
            )}
            {status === "not_downloaded" && (
              <button
                type="button"
                onClick={() =>
                  item.defId && onDownload(item.defId, item.localEngine)
                }
                className={ghostBtn}
              >
                <Download size={13} />
                {item.sizeBytes != null
                  ? formatBytes(item.sizeBytes)
                  : "Download"}
              </button>
            )}
            {downloading && onCancel && (
              <button
                type="button"
                onClick={() =>
                  item.defId && onCancel(item.defId, item.localEngine)
                }
                className={ghostBtn}
              >
                <X size={12} />
                Cancel
              </button>
            )}
            {status === "error" && (
              <button
                type="button"
                onClick={() => {
                  if (!item.defId) return;
                  if (item.localEngine === "mlx" && onRetryLocal) {
                    onRetryLocal(item.defId, "mlx");
                  } else {
                    onDownload(item.defId);
                  }
                }}
                className={ghostBtn}
              >
                <RefreshCw size={12} />
                {item.localEngine === "mlx" && isSetupError
                  ? "Check setup"
                  : "Retry"}
              </button>
            )}
          </>
        ) : item.hasKey ? (
          <button
            type="button"
            onClick={() => item.available && onSelectCloud(item.available)}
            className={solidBtn}
          >
            Use
          </button>
        ) : (
          <button
            type="button"
            onClick={() => item.available && onSelectCloud(item.available)}
            className={ghostBtn}
          >
            <Key size={12} />
            Add key
          </button>
        )}
      </div>
    </div>
  );
}
