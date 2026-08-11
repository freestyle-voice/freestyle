import { Button } from "@renderer/components/ui/button";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { ToneSettings } from "./use-tone-settings";

// Shown while post-processing is off. Cleanup enablement lives on the Models
// page, so this points users there (and offers a one-click Freestyle Cloud
// path when signed in).
function CleanupDisabledBanner({
  signedIn,
  busy,
  onUseCloud,
}: {
  signedIn: boolean;
  busy: boolean;
  onUseCloud: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="border-border/70 bg-card mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-foreground text-[13px] font-medium">
          {t("tone.disabledBanner.title")}
        </p>
        <p className="text-muted-foreground mt-0.5 text-[12px] leading-[1.5]">
          {t("tone.disabledBanner.desc")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {signedIn ? (
          <Button variant="ink" size="sm" onClick={onUseCloud} disabled={busy}>
            {busy
              ? t("tone.disabledBanner.useCloudBusy")
              : t("tone.disabledBanner.useCloud")}
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link to="/settings/models">
            {t("tone.disabledBanner.goToModels")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

// Cleanup is enabled but no LLM model is configured, so nothing actually runs.
function CleanupNoModelBanner(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="border-border/70 bg-card mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-foreground text-[13px] font-medium">
          {t("tone.cleanup.noModelTitle")}
        </p>
        <p className="text-muted-foreground mt-0.5 text-[12px] leading-[1.5]">
          {t("tone.cleanup.noModelDesc")}
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/settings/models">{t("tone.cleanup.noModelCta")}</Link>
      </Button>
    </div>
  );
}

/** Whichever cleanup-state banner applies, or nothing when all is well. */
export function ToneStateBanner({
  settings,
}: {
  settings: ToneSettings;
}): React.JSX.Element | null {
  if (!settings.llmCleanup) {
    return (
      <CleanupDisabledBanner
        signedIn={settings.signedIn}
        busy={settings.usingCloud}
        onUseCloud={() => void settings.onUseCloud()}
      />
    );
  }
  if (!settings.hasCleanupModel) return <CleanupNoModelBanner />;
  return null;
}
