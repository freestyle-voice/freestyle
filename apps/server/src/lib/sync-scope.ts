import { syncScopeKey } from "@freestyle-voice/sync";
import { readSetting, writeSetting } from "./db.js";
import { resolveActiveOrgId } from "./freestyle-cloud.js";
import { getSession } from "./sessions.js";

function settingKey(host: string, userId: string): string {
  return `sync_scope:${host}:${userId}`;
}

export function cachedSyncScope(): string | null {
  const session = getSession();
  if (!session) return null;
  return readSetting(settingKey(session.host, session.user.id)) ?? null;
}

export async function resolveSyncScope(): Promise<string | null> {
  const session = getSession();
  if (!session) return null;
  const organizationId = await resolveActiveOrgId(session.token);
  if (!organizationId) return null;
  const scope = syncScopeKey({ userId: session.user.id, organizationId });
  writeSetting(settingKey(session.host, session.user.id), scope);
  return scope;
}
