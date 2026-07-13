import { Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApplicationPanel } from "./application-panel";
import { SettingsSidebar } from "./components";
import { parseSettingsSection, type SettingsSectionId } from "./constants";
import { DataPanel } from "./data-panel";
import { DisplayPanel } from "./display-panel";
import { NetworkPanel } from "./network-panel";
import { PermissionsPanel } from "./permissions-panel";
import { RecordingPanel } from "./recording-panel";
import { useAppUpdater } from "./use-app-updater";

export default function SettingsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() =>
    parseSettingsSection(window.location.hash),
  );
  const {
    updateAvailable,
    updateDownloaded,
    downloading,
    updateError,
    startDownload,
    installUpdate,
  } = useAppUpdater();

  const selectSection = useCallback((id: SettingsSectionId) => {
    setActiveSection(id);
    const nextHash = `#${id}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setActiveSection(parseSettingsSection(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const activeSectionLabel = t(`settings.sections.${activeSection}`);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="h-7 shrink-0" />
      <div
        className="responsive-page-scroll grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-x-10 gap-y-6 !pb-0 min-[900px]:grid-cols-[180px_minmax(0,1fr)]"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div className="min-[900px]:col-span-2">
          <div className="mb-7">
            <h1 className="serif text-foreground m-0 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
              <span className="serif-italic text-primary">
                {t("settings.title")}
              </span>
              <span>. </span>
            </h1>
          </div>

          {updateAvailable && (
            <div className="border-primary/30 bg-primary/5 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <Download className="text-primary h-4 w-4" />
                <span className="min-w-0 text-sm">
                  {updateDownloaded
                    ? t("settings.updateReady", { version: updateAvailable })
                    : t("settings.updateAvailable", {
                        version: updateAvailable,
                      })}
                </span>
              </div>
              {updateDownloaded ? (
                <button
                  type="button"
                  onClick={installUpdate}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs font-medium"
                >
                  {t("common.restartAndUpdate")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startDownload}
                  disabled={downloading}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs font-medium disabled:opacity-50"
                >
                  {downloading ? t("common.downloading") : t("common.download")}
                </button>
              )}
              {updateError && (
                <span className="text-destructive w-full text-xs">
                  {updateError}
                </span>
              )}
            </div>
          )}
        </div>

        <SettingsSidebar active={activeSection} onSelect={selectSection} />

        <div className="min-h-0 overflow-y-auto px-1 -mx-1">
          <h2 className="text-foreground mb-6 text-[22px] font-medium tracking-[-0.02em]">
            {activeSectionLabel}
          </h2>

          {activeSection === "recording" && <RecordingPanel />}
          {activeSection === "application" && <ApplicationPanel />}
          {activeSection === "display" && <DisplayPanel />}
          {activeSection === "permissions" && <PermissionsPanel />}
          {activeSection === "data" && <DataPanel />}
          {activeSection === "network" && <NetworkPanel />}
        </div>
      </div>
    </div>
  );
}
