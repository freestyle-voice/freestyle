import { getDb } from "./db.js";
import { capture, registerSuperProperties } from "./posthog.js";
import { getSession } from "./sessions.js";

const VERSION_KEY = "analytics_last_version";

function readSetting(key: string): string | null {
  try {
    const row = getDb()
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      )
      .run(key, value);
  } catch {
    // Analytics bookkeeping must never break startup.
  }
}

/**
 * Emit the launch trio once per process start.
 *
 * Lives on the server rather than in main because this is where both the
 * persisted settings table and FREESTYLE_APP_VERSION are already available, so
 * "is this the first launch" needs no new storage.
 */
export function recordAppLaunch(): void {
  const version = process.env.FREESTYLE_APP_VERSION ?? "unknown";
  const previous = readSetting(VERSION_KEY);

  registerSuperProperties({ app_version: version });

  if (previous === null) {
    capture("app_installed", { version });
  } else if (previous !== version) {
    capture("app_updated", { from: previous, to: version });
  }
  if (previous !== version) writeSetting(VERSION_KEY, version);

  capture("app_launched", {
    version,
    signed_in: !!getSession(),
    first_launch: previous === null,
  });
}
