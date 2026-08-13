import { createAppLogger } from "@freestyle-voice/utils";
import { readSetting, writeSetting } from "./db.js";
import { putCloudUserProfile } from "./freestyle-cloud.js";
import { getSession } from "./sessions.js";

const log = createAppLogger("timezone-sync");

/** Keyed by account so a different sign-in on this device re-syncs. */
const SETTING_KEY = "cloud_synced_timezone";

/**
 * Push this machine's IANA timezone into the cloud profile so scheduled tasks
 * and triage run on the user's clock. Skips the round-trip when the zone
 * already synced for this account; safe to fire-and-forget.
 */
export async function syncTimezoneToCloud(): Promise<void> {
  const session = getSession();
  if (!session) return;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!zone) return;
  const marker = `${session.user.id}|${zone}`;
  if (readSetting(SETTING_KEY) === marker) return;
  try {
    await putCloudUserProfile(session.token, { timezone: zone });
    writeSetting(SETTING_KEY, marker);
  } catch (err) {
    log.debug(
      `Timezone sync failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
