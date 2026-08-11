import type { CleanupAppAssignment } from "@freestyle-voice/validations";
import type { AppMarkId } from "@renderer/components/tone-previews/app-marks";
import { getVisibleBuiltinRouteIds } from "@renderer/components/tone-previews/route-ownership";
import { useTranslation } from "react-i18next";
import { type DestinationMeta, destinationValue } from "./options";
import type { ToneSettings } from "./use-tone-settings";

/**
 * Current voice and routed apps for one destination.
 *
 * Shared by the index row and the destination page. It lives here rather than
 * in either page so the destination route doesn't have to import the index
 * module, which would pull the whole index chunk along with it.
 */
export function useDestinationSummary(
  meta: DestinationMeta,
  settings: ToneSettings,
): {
  toneLabel: string;
  isOff: boolean;
  appIds: AppMarkId[];
  assignments: CleanupAppAssignment[];
} {
  const { t } = useTranslation();

  const value = destinationValue(meta, settings);
  const active =
    meta.options.find((option) => option.value === value) ?? meta.options[0]!;

  // Which built-ins still belong here, after everything the user has moved.
  const appIds = meta.canManageRoutes
    ? getVisibleBuiltinRouteIds(
        meta.destination as "personal" | "work" | "email",
        settings.assignments,
      )
    : [];

  return {
    toneLabel: t(active.titleKey),
    isOff: active.value === "off",
    appIds,
    assignments: settings.assignments.filter(
      (a) => a.destination === meta.destination,
    ),
  };
}
