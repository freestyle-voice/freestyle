import { cn } from "@renderer/lib/utils";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function UpdateBanner({
  className,
}: {
  className?: string;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    const removeAvail = window.api?.onUpdateAvailable((info) => {
      setUpdateAvailable(info.version);
    });
    const removeDownloading = window.api?.onUpdateDownloading(() => {
      setDownloading(true);
      setUpdateError(null);
    });
    const removeDownloaded = window.api?.onUpdateDownloaded(() => {
      setUpdateDownloaded(true);
      setDownloading(false);
    });
    const removeError = window.api?.onUpdateError((info) => {
      setDownloading(false);
      setUpdateError(info.message);
    });
    window.api
      ?.checkForUpdate()
      .then((result) => {
        if (result) {
          setUpdateAvailable(result.version);
          if (result.downloadState === "downloading") {
            setDownloading(true);
          } else if (result.downloadState === "downloaded") {
            setUpdateDownloaded(true);
          }
        }
      })
      .catch(() => {});

    return () => {
      removeAvail?.();
      removeDownloading?.();
      removeDownloaded?.();
      removeError?.();
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div
      className={cn(
        "border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Download className="text-primary h-4 w-4" />
        <span className="min-w-0 text-sm">
          {updateDownloaded
            ? t("settings.updateReady", { version: updateAvailable })
            : t("settings.updateAvailable", { version: updateAvailable })}
        </span>
      </div>
      {updateDownloaded ? (
        <button
          type="button"
          onClick={() => window.api?.installUpdate()}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs font-medium"
        >
          {t("common.restartAndUpdate")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDownloading(true);
            setUpdateError(null);
            window.api?.downloadUpdate();
          }}
          disabled={downloading}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs font-medium disabled:opacity-50"
        >
          {downloading ? t("common.downloading") : t("common.download")}
        </button>
      )}
      {updateError && (
        <span className="text-destructive w-full text-xs">{updateError}</span>
      )}
    </div>
  );
}
