import { getDb } from "./db.js";
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
  getDb().prepare("DELETE FROM sessions WHERE id = 1").run();
}

export function invalidateSession(): void {
  clearSession();
  resetCloudIdentity();
  revertFreestyleCloudDefaults();
}

export function getSession(): Session | null {
  const row = getDb()
    .prepare(
      "SELECT token, refresh_token, expires_at, issued_at, user_id, email, name, image, host FROM sessions WHERE id = 1",
    )
    .get() as SessionRow | undefined;
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

export interface SessionExpiry {
  /** Epoch ms when the token expires, or null if it never expires locally. */
  expiresAt: number | null;
  /** Ms remaining until expiry, or null when there is no expiry. */
  remainingMs: number | null;
}

/**
 * Report the current session's expiry without mutating it. Returns null when
 * there is no (valid) session. Unlike {@link getSession}, this is purely
 * informational — callers use it to decide whether to renew or warn the user.
 * Note: {@link getSession} still invalidates an already-expired session, so a
 * non-null result here always describes a live token.
 */
export function getSessionExpiry(): SessionExpiry | null {
  const session = getSession();
  if (!session) return null;
  const expiresAt = session.expiresAt ?? null;
  return {
    expiresAt,
    remainingMs: expiresAt === null ? null : expiresAt - Date.now(),
  };
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
      "UPDATE sessions SET expires_at = ?, issued_at = ?, updated_at = ? WHERE id = 1",
    )
    .run(expiresAt, now, now);
}

export function getSessionUser(): CloudUser | null {
  return getSession()?.user ?? null;
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
  getDb()
    .prepare(
      `INSERT INTO sessions
        (id, token, refresh_token, expires_at, issued_at, user_id, email, name, image, host, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        token = excluded.token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        issued_at = excluded.issued_at,
        user_id = excluded.user_id,
        email = excluded.email,
        name = excluded.name,
        image = excluded.image,
        host = excluded.host,
        updated_at = excluded.updated_at`,
    )
    .run(
      input.token,
      input.refreshToken ?? null,
      input.expiresAt ?? null,
      input.issuedAt ?? null,
      input.user.id,
      input.user.email,
      input.user.name ?? null,
      input.user.image ?? null,
      input.host,
      now,
    );
}
