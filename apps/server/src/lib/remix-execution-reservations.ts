import { prepareCached } from "./db.js";
import { getSession } from "./sessions.js";

/** A Cloud claim receipt may be replayed, but local execution has one owner.
 * Never expire/reassign this reservation: a crashed observer may already have
 * performed the side effect. Explicit Cloud retry creates a new action ID. */
export function reserveRemixExecution(
  actionId: string,
  clientId: string,
  observerId: string,
): boolean {
  const session = getSession();
  if (!session) return false;
  const key = `remix.execution.${encodeURIComponent(session.host)}.${session.user.id}.${actionId}`;
  const value = JSON.stringify({ clientId, observerId });
  prepareCached(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO NOTHING",
  ).run(key, value);
  const saved = prepareCached("SELECT value FROM settings WHERE key = ?").get(
    key,
  ) as { value: string } | undefined;
  return saved?.value === value;
}
