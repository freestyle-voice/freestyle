import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createAppLogger } from "@freestyle/utils";
import { app, safeStorage, shell } from "electron";
import type { CloudUser } from "../shared/cloud-user";

export type { CloudUser };

const log = createAppLogger("cloud-auth");

// Keep in sync with the freestyle-cloud provider's default in apps/server.
const DEFAULT_CLOUD_URL = "https://freestyle-server.freestyle.workers.dev";
const CLIENT_ID = "freestyle-desktop";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

function cloudUrl(): string {
  return (process.env.FREESTYLE_CLOUD_URL || DEFAULT_CLOUD_URL).replace(
    /\/+$/,
    "",
  );
}

interface StoredAuth {
  token: string;
  encrypted: boolean;
  expiresAt?: string;
  user: CloudUser;
}

// The decrypted token + profile live only in main-process memory. The token is
// never exposed to the renderer (which only ever sees the user profile).
let current: { token: string; user: CloudUser } | null = null;
let embeddedServerPort = 0;

/** Called once the embedded server is bound so we can push token updates. */
export function setEmbeddedServerPort(port: number): void {
  embeddedServerPort = port;
}

/** Push the current in-memory token to the embedded server (e.g. a reused one). */
export async function syncCloudTokenToServer(): Promise<void> {
  await pushTokenToServer(current?.token ?? null);
}

function storePath(): string {
  return join(app.getPath("userData"), "cloud-auth.json");
}

async function persist(
  token: string,
  user: CloudUser,
  expiresAt?: string,
): Promise<void> {
  const canEncrypt = safeStorage.isEncryptionAvailable();
  const stored: StoredAuth = {
    token: canEncrypt
      ? safeStorage.encryptString(token).toString("base64")
      : token,
    encrypted: canEncrypt,
    expiresAt,
    user,
  };
  if (!canEncrypt) {
    log.warn("OS keychain unavailable; storing cloud token unencrypted");
  }
  await writeFile(storePath(), JSON.stringify(stored), "utf8");
}

/** Load a previously stored token into memory. Returns the token, or null. */
export async function loadStoredCloudToken(): Promise<string | null> {
  try {
    const stored = JSON.parse(
      await readFile(storePath(), "utf8"),
    ) as StoredAuth;
    const token = stored.encrypted
      ? safeStorage.decryptString(Buffer.from(stored.token, "base64"))
      : stored.token;
    current = { token, user: stored.user };
    return token;
  } catch {
    return null;
  }
}

export function getCloudUser(): CloudUser | null {
  return current?.user ?? null;
}

async function pushTokenToServer(token: string | null): Promise<void> {
  if (!embeddedServerPort) return;
  try {
    await fetch(`http://127.0.0.1:${embeddedServerPort}/api/cloud-auth`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    log.warn(`failed to push cloud token to embedded server: ${err}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

async function pollForToken(
  base: string,
  deviceCode: string,
  intervalSeconds: number,
  expiresInSeconds: number,
): Promise<string> {
  const deadline = Date.now() + expiresInSeconds * 1000;
  let intervalMs = Math.max(1, intervalSeconds) * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const res = await fetch(`${base}/auth/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: DEVICE_GRANT,
        device_code: deviceCode,
        client_id: CLIENT_ID,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
    };

    if (res.ok && data.access_token) return data.access_token;

    switch (data.error) {
      case "authorization_pending":
        break;
      case "slow_down":
        intervalMs += 5000;
        break;
      case "access_denied":
        throw new Error("Sign-in was denied.");
      case "expired_token":
        throw new Error("Sign-in request expired. Please try again.");
      default:
        throw new Error(
          data.error || `Device token request failed (${res.status})`,
        );
    }
  }
  throw new Error("Sign-in timed out. Please try again.");
}

async function fetchMe(base: string, token: string): Promise<CloudUser> {
  const res = await fetch(`${base}/v1/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  const data = (await res.json()) as { user: CloudUser };
  return data.user;
}

/**
 * Run the OAuth Device Authorization flow against the Freestyle Cloud backend:
 * request a device code, open the system browser to the approval page, poll for
 * the session token, then persist it and push it to the embedded server.
 */
export async function signInToCloud(opts?: {
  onUserCode?: (userCode: string) => void;
}): Promise<CloudUser> {
  const base = cloudUrl();

  const codeRes = await fetch(`${base}/auth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!codeRes.ok) {
    throw new Error(`Could not start sign-in (${codeRes.status})`);
  }
  const code = (await codeRes.json()) as DeviceCodeResponse;
  opts?.onUserCode?.(code.user_code);

  // System browser (never an embedded webview): reuses the user's Google
  // session and is required by Google for OAuth.
  await shell.openExternal(
    code.verification_uri_complete || code.verification_uri,
  );

  const token = await pollForToken(
    base,
    code.device_code,
    code.interval,
    code.expires_in,
  );
  const user = await fetchMe(base, token);

  current = { token, user };
  await persist(token, user);
  await pushTokenToServer(token);
  log.info(`signed in to Freestyle Cloud as ${user.email}`);
  return user;
}

export async function signOutOfCloud(): Promise<void> {
  const token = current?.token;
  if (token) {
    try {
      await fetch(`${cloudUrl()}/auth/sign-out`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
    } catch {
      // Best-effort server-side revocation; clearing locally is what matters.
    }
  }
  current = null;
  try {
    await rm(storePath(), { force: true });
  } catch {}
  await pushTokenToServer(null);
}
