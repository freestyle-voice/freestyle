import type { AvailableModel, VoiceItem } from "@renderer/lib/models";
import { formatBytes, formatSpeed } from "@renderer/lib/models";
import { cn } from "@renderer/lib/utils";
import {
  Check,
  CircleDollarSign,
  Download,
  Key,
  LogIn,
  RefreshCw,
  Target,
  Trash2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Switch } from "./ui/switch";
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
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return <Switch checked={on} onCheckedChange={onChange} disabled={disabled} />;
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
  const isFreestyleCloud = item.available?.provider_id === "freestyle-cloud";
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
            <Progress
              value={
                hasProgress ? (item.state?.downloadProgress?.percent ?? 0) : 100
              }
              className={cn("h-[5px]", !hasProgress && "animate-pulse")}
            />
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
                <Button
                  variant="ink"
                  size="sm"
                  onClick={() =>
                    item.defId &&
                    onSelectLocal(item.defId, item.name, item.localEngine)
                  }
                >
                  Use
                </Button>
                {onDelete && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      item.defId && onDelete(item.defId, item.localEngine)
                    }
                    title="Remove downloaded model from disk"
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>
                )}
              </>
            )}
            {status === "not_downloaded" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  item.defId && onDownload(item.defId, item.localEngine)
                }
              >
                <Download data-icon="inline-start" />
                {item.sizeBytes != null
                  ? formatBytes(item.sizeBytes)
                  : "Download"}
              </Button>
            )}
            {downloading && onCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  item.defId && onCancel(item.defId, item.localEngine)
                }
              >
                <X data-icon="inline-start" />
                Cancel
              </Button>
            )}
            {status === "error" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!item.defId) return;
                  if (item.localEngine === "mlx" && onRetryLocal) {
                    onRetryLocal(item.defId, "mlx");
                  } else {
                    onDownload(item.defId);
                  }
                }}
              >
                <RefreshCw data-icon="inline-start" />
                {item.localEngine === "mlx" && isSetupError
                  ? "Check setup"
                  : "Retry"}
              </Button>
            )}
          </>
        ) : item.hasKey ? (
          <Button
            variant="ink"
            size="sm"
            onClick={() => item.available && onSelectCloud(item.available)}
          >
            Use
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => item.available && onSelectCloud(item.available)}
          >
            {isFreestyleCloud ? (
              <LogIn data-icon="inline-start" />
            ) : (
              <Key data-icon="inline-start" />
            )}
            {isFreestyleCloud ? "Sign in" : "Add key"}
          </Button>
        )}
      </div>
    </div>
  );
}
