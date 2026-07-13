import { useCallback, useEffect, useState } from "react";

export interface AppUpdaterState {
  updateAvailable: string | null;
  updateDownloaded: boolean;
  downloading: boolean;
  updateError: string | null;
  startDownload: () => void;
  installUpdate: () => void;
}

/**
 * Auto-updater state for the Settings shell: subscribes to main-process
 * updater events, seeds current state on mount, and exposes the download /
 * install actions shown in the update banner. This is transient UI state (not
 * a persisted setting), so it lives outside the per-tab forms.
 */
export function useAppUpdater(): AppUpdaterState {
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

  const startDownload = useCallback(() => {
    setDownloading(true);
    setUpdateError(null);
    window.api?.downloadUpdate();
  }, []);

  const installUpdate = useCallback(() => {
    window.api?.installUpdate();
  }, []);

  return {
    updateAvailable,
    updateDownloaded,
    downloading,
    updateError,
    startDownload,
    installUpdate,
  };
}
