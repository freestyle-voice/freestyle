import { IS_MAC, IS_WINDOWS } from "@renderer/lib/platform";
import { useTranslation } from "react-i18next";
import { PermissionControl, Row, SettingsPanel } from "./components";
import { usePermissions } from "./use-permissions";

/**
 * Permissions has no persisted fields — it only reflects OS permission status
 * and triggers native dialogs — so it is intentionally not a react-hook-form.
 */
export function PermissionsPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const {
    micStatus,
    accessibilityStatus,
    requestMic,
    openMicSettings,
    openAccessibility,
  } = usePermissions();

  // macOS and Windows can deep-link to the OS mic privacy settings.
  const canOpenMicSettings = IS_MAC || IS_WINDOWS;

  return (
    <SettingsPanel>
      <Row
        label={t("settings.permissions.microphone")}
        desc={t("settings.permissions.microphoneDesc")}
      >
        <PermissionControl
          granted={micStatus === "granted"}
          checking={micStatus === "unknown"}
          actionLabel={
            micStatus === "denied" && canOpenMicSettings
              ? t("common.openSettings")
              : micStatus === "granted"
                ? null
                : t("common.allow")
          }
          external={micStatus === "denied" && canOpenMicSettings}
          onAction={
            micStatus === "denied" && canOpenMicSettings
              ? openMicSettings
              : requestMic
          }
          onManage={canOpenMicSettings ? openMicSettings : undefined}
        />
      </Row>
      <Row
        label={t("settings.permissions.accessibility")}
        desc={
          IS_MAC
            ? t("settings.permissions.accessibilityDescMac")
            : t("settings.permissions.accessibilityDescOther")
        }
        last
      >
        <PermissionControl
          granted={accessibilityStatus === true}
          checking={accessibilityStatus === null}
          actionLabel={
            accessibilityStatus === true
              ? null
              : IS_MAC
                ? t("common.openSettings")
                : null
          }
          external={IS_MAC}
          onAction={openAccessibility}
          onManage={IS_MAC ? openAccessibility : undefined}
          note={
            !IS_MAC && accessibilityStatus !== true
              ? t("settings.permissions.autoGranted")
              : undefined
          }
        />
      </Row>
    </SettingsPanel>
  );
}
