import { getDb } from "./db.js";
import { DEFAULT_CLOUD_URL, freestyleCloudUrl } from "./freestyle-cloud.js";
import { revertFreestyleCloudDefaults } from "./freestyle-cloud-defaults.js";
import { resetCloudIdentity } from "./posthog.js";

export interface CloudUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

export interface Session {
  token: string;
  refreshToken?: string;
  expiresAt?: number;
  issuedAt?: number;
  user: CloudUser;
  host: string;
}

interface SessionRow {
  token: string;
  refresh_token: string | null;
  expires_at: number | null;
  issued_at: number | null;
  user_id: string;
  email: string;
  name: string | null;
  image: string | null;
  host: string;
}

function rowToSession(row: SessionRow): Session {
  return {
    token: row.token,
    ...(row.refresh_token ? { refreshToken: row.refresh_token } : {}),
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
    ...(row.issued_at ? { issuedAt: row.issued_at } : {}),
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      image: row.image,
    },
    host: row.host,
  };
}

export function clearSession(): void {
  getDb()
    .prepare("DELETE FROM sessions WHERE host = ?")
    .run(freestyleCloudUrl());
}

export function invalidateSession(): void {
  clearSession();
  resetCloudIdentity();
  revertFreestyleCloudDefaults();
}

export function getSession(): Session | null {
  const row = getDb()
    .prepare(
      "SELECT token, refresh_token, expires_at, issued_at, user_id, email, name, image, host FROM sessions WHERE host = ?",
    )
    .get(freestyleCloudUrl()) as SessionRow | undefined;
  if (!row) return null;
  if (row.expires_at && Date.now() > row.expires_at) {
    invalidateSession();
    return null;
  }
  return rowToSession(row);
}

export function getSessionToken(): string | null {
  return getSession()?.token ?? null;
}

/**
 * Update only the expiry timestamps of the stored session, leaving the token
 * and user untouched. Used by the keep-alive scheduler after the cloud slides
 * the session window forward. No-op when there is no session.
 */
export function touchSessionExpiry(expiresAt: number): void {
  const session = getSession();
  if (!session) return;
  const now = Date.now();
  getDb()
    .prepare(
      "UPDATE sessions SET expires_at = ?, issued_at = ?, updated_at = ? WHERE host = ?",
    )
    .run(expiresAt, now, now, freestyleCloudUrl());
}

export function setSession(input: {
  token: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  issuedAt?: number | null;
  user: CloudUser;
  host: string;
}): void {
  const now = Date.now();
  // Keep the default/prod host row at id=1 so older released binaries — which
  // query sessions by `WHERE id = 1` and `INSERT ... ON CONFLICT(id)` — keep
  // working after this schema change. Non-default hosts (e.g. dev) get NULL,
  // which SQLite allows to repeat under the UNIQUE(id) constraint.
  const id = input.host === DEFAULT_CLOUD_URL ? 1 : null;
  getDb()
    .prepare(
      `INSERT INTO sessions
        (id, host, token, refresh_token, expires_at, issued_at, user_id, email, name, image, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(host) DO UPDATE SET
        id = excluded.id,
        token = excluded.token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        issued_at = excluded.issued_at,
        user_id = excluded.user_id,
        email = excluded.email,
        name = excluded.name,
        image = excluded.image,
        updated_at = excluded.updated_at`,
    )
    .run(
      id,
      input.host,
      input.token,
      input.refreshToken ?? null,
      input.expiresAt ?? null,
      input.issuedAt ?? null,
      input.user.id,
      input.user.email,
      input.user.name ?? null,
      input.user.image ?? null,
      now,
    );
}
