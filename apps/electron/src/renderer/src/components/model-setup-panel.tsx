import type { VoiceItem } from "@renderer/lib/models";
import { formatBytes, formatSpeed } from "@renderer/lib/models";
import { cn, ON_DEVICE_PHRASE } from "@renderer/lib/utils";
import { Download, HardDrive, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";

type ModelSetupPanelProps = {
  model: VoiceItem | undefined;
  onDownload: () => void;
  onRetry: () => void;
};

export function ModelSetupPanel({
  model,
  onDownload,
  onRetry,
}: ModelSetupPanelProps): React.JSX.Element | null {
  const { t } = useTranslation();

  if (!model || model.kind !== "local") return null;

  const status = model.status ?? "not_downloaded";
  if (status === "ready") return null;

  const sizeLabel =
    model.sizeBytes != null ? formatBytes(model.sizeBytes) : null;
  const progress = model.state?.downloadProgress;
  const hasProgress = !!progress;
  const isActive =
    status === "downloading" ||
    status === "verifying" ||
    model.state?.phase === "building_binary";
  const isError = status === "error";
  const isIdle = status === "not_downloaded" && !isActive;

  return (
    <div
      className={cn(
        "bg-card border-border mt-6 w-full rounded-[14px] border px-4 py-3.5",
        isError && "border-destructive/40",
      )}
      role={isActive ? "status" : undefined}
      aria-live={isActive ? "polite" : undefined}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]",
            isError ? "bg-destructive/10" : "bg-accent",
          )}
        >
          {isActive ? (
            <Loader2 className="text-primary h-4 w-4 animate-spin" />
          ) : isError ? (
            <HardDrive className="text-destructive h-4 w-4" />
          ) : (
            <HardDrive className="text-primary h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-foreground text-[13.5px] leading-snug font-medium">
            {isError
              ? t("onboarding.modelSetup.errorTitle")
              : isActive
                ? model.state?.phase === "building_binary"
                  ? t("onboarding.modelSetup.buildingEngine")
                  : t("onboarding.modelSetup.downloading", {
                      name: model.name,
                    })
                : t("onboarding.modelSetup.title")}
          </p>

          <p className="text-muted-foreground mt-1 text-[12px] leading-snug">
            {isError
              ? (model.state?.error ?? t("onboarding.modelSetup.errorFallback"))
              : isActive
                ? model.state?.phase === "building_binary"
                  ? t("onboarding.modelSetup.buildingEngineDesc")
                  : t("onboarding.modelSetup.downloadingDesc", {
                      phrase: ON_DEVICE_PHRASE,
                    })
                : t("onboarding.modelSetup.idleDesc", {
                    name: model.name,
                    size: sizeLabel ? ` (${sizeLabel})` : "",
                    phrase: ON_DEVICE_PHRASE,
                  })}
          </p>

          {isActive && (
            <div className="mt-3 space-y-1.5">
              <Progress
                value={hasProgress ? (progress?.percent ?? 0) : 100}
                className={cn("h-[6px]", !hasProgress && "animate-pulse")}
              />
              <div className="text-muted-foreground mono flex justify-between text-[10px]">
                {model.state?.phase === "building_binary" && !hasProgress ? (
                  <span>{t("onboarding.modelSetup.buildingEngine")}</span>
                ) : hasProgress ? (
                  <>
                    <span>
                      {formatBytes(progress!.bytesDownloaded)} /{" "}
                      {formatBytes(progress!.bytesTotal)}
                    </span>
                    <span>
                      {progress!.speedBps > 0 &&
                        formatSpeed(progress!.speedBps)}
                      {progress!.percent > 0 && ` · ${progress!.percent}%`}
                    </span>
                  </>
                ) : (
                  <span>{t("onboarding.modelSetup.preparing")}</span>
                )}
              </div>
            </div>
          )}

          {isIdle && (
            <Button
              variant="default"
              size="sm"
              className="mt-3"
              onClick={onDownload}
            >
              <Download data-icon="inline-start" />
              {sizeLabel
                ? t("onboarding.modelSetup.downloadButton", { size: sizeLabel })
                : t("onboarding.modelSetup.downloadButtonShort")}
            </Button>
          )}

          {isError && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onRetry}
            >
              <RefreshCw data-icon="inline-start" />
              {t("onboarding.modelSetup.retry")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
