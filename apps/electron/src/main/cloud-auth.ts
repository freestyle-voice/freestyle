import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createAppLogger } from "@freestyle/utils";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { app, safeStorage, shell } from "electron";
import type { CloudUser } from "../shared/cloud-user";

export type { CloudUser };

const log = createAppLogger("cloud-auth");

// Keep in sync with the freestyle-cloud provider's default in apps/server.
const DEFAULT_CLOUD_URL = "https://service.freestylevoice.com";
const CLIENT_ID = "freestyle-desktop";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

function cloudUrl(): string {
  return (process.env.FREESTYLE_CLOUD_URL || DEFAULT_CLOUD_URL).replace(
    /\/+$/,
    "",
  );
}

function createCloudAuthClient(base: string) {
  return createAuthClient({
    baseURL: `${base}/auth`,
    disableDefaultFetchPlugins: true,
    plugins: [deviceAuthorizationClient()],
  });
}

function authClientErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as Record<string, unknown>;
  return typeof e.error === "string"
    ? e.error
    : typeof e.code === "string"
      ? e.code
      : undefined;
}

function authClientErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const e = error as Record<string, unknown>;
  return typeof e.message === "string"
    ? e.message
    : typeof e.error_description === "string"
      ? e.error_description
      : fallback;
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
let signInAbort: AbortController | null = null;

export class CloudSignInCancelledError extends Error {
  constructor() {
    super("Sign-in cancelled.");
    this.name = "CloudSignInCancelledError";
  }
}

/** Abort an in-flight device-flow sign-in (poll loop + pending requests). */
export function cancelCloudSignIn(): void {
  signInAbort?.abort();
}

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
      body: JSON.stringify({
        token,
        user: token ? (current?.user ?? null) : null,
      }),
    });
  } catch (err) {
    log.warn(`failed to push cloud token to embedded server: ${err}`);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CloudSignInCancelledError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new CloudSignInCancelledError());
      },
      { once: true },
    );
  });
}

async function pollForToken(
  authClient: ReturnType<typeof createCloudAuthClient>,
  deviceCode: string,
  intervalSeconds: number,
  expiresInSeconds: number,
  signal: AbortSignal,
): Promise<string> {
  const deadline = Date.now() + expiresInSeconds * 1000;
  let intervalMs = Math.max(1, intervalSeconds) * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs, signal);
    const { data, error } = await authClient.device.token({
      grant_type: DEVICE_GRANT,
      device_code: deviceCode,
      client_id: CLIENT_ID,
      fetchOptions: { signal },
    });

    if (data?.access_token) return data.access_token;

    switch (authClientErrorCode(error)) {
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
          authClientErrorMessage(error, "Device token request failed"),
        );
    }
  }
  throw new Error("Sign-in timed out. Please try again.");
}

async function fetchMe(
  base: string,
  token: string,
  signal: AbortSignal,
): Promise<CloudUser> {
  const res = await fetch(`${base}/v1/me`, {
    headers: { authorization: `Bearer ${token}` },
    signal,
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
  const authClient = createCloudAuthClient(base);
  signInAbort?.abort();
  const controller = new AbortController();
  signInAbort = controller;
  const { signal } = controller;

  try {
    const { data: code, error } = await authClient.device.code({
      client_id: CLIENT_ID,
      fetchOptions: { signal },
    });
    if (error || !code) {
      throw new Error(authClientErrorMessage(error, "Could not start sign-in"));
    }
    opts?.onUserCode?.(code.user_code);

    // System browser (never an embedded webview): reuses the user's existing
    // provider session and is required for the OAuth approval page.
    await shell.openExternal(
      code.verification_uri_complete || code.verification_uri,
    );

    const token = await pollForToken(
      authClient,
      code.device_code,
      code.interval,
      code.expires_in,
      signal,
    );
    const user = await fetchMe(base, token, signal);

    current = { token, user };
    await persist(token, user);
    await pushTokenToServer(token);
    log.info(`signed in to Freestyle Cloud as ${user.email}`);
    return user;
  } catch (err) {
    if (signal.aborted) throw new CloudSignInCancelledError();
    throw err;
  } finally {
    if (signInAbort === controller) signInAbort = null;
  }
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
