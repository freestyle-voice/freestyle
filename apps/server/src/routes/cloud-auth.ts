import { Hono } from "hono";
import { setCloudAuthToken } from "../lib/cloud-auth.js";
import { getDb } from "../lib/db.js";
import {
  type CloudIdentity,
  identifyCloudUser,
  resetCloudIdentity,
} from "../lib/posthog.js";
import { FREESTYLE_CLOUD_PROVIDER_ID } from "../lib/streaming/providers/freestyle-cloud.js";

const LOCAL_VOICE_PROVIDERS = ["local-mlx", "local-whisper"];

function revertCloudVoiceDefault(): void {
  const db = getDb();
  const current = db
    .prepare(
      "SELECT provider FROM model_configs WHERE type = 'voice' AND is_default = 1 LIMIT 1",
    )
    .get() as { provider: string } | undefined;
  if (!current || current.provider !== FREESTYLE_CLOUD_PROVIDER_ID) return;

  const placeholders = LOCAL_VOICE_PROVIDERS.map(() => "?").join(", ");
  const local = db
    .prepare(
      `SELECT id FROM model_configs WHERE type = 'voice' AND provider IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`,
    )
    .get(...LOCAL_VOICE_PROVIDERS) as { id: number } | undefined;
  if (!local) return;

  db.prepare(
    "UPDATE model_configs SET is_default = 0 WHERE type = 'voice'",
  ).run();
  db.prepare("UPDATE model_configs SET is_default = 1 WHERE id = ?").run(
    local.id,
  );
}

// Loopback-only (the server binds 127.0.0.1). The Electron main process pushes
// the Freestyle Cloud session token here after sign-in / sign-out so the
// freestyle-cloud provider can attach it without a server restart. Send
// `{ token: null }` (or an empty token) to clear it on sign-out.
function parseIdentity(user: unknown): CloudIdentity | null {
  if (!user || typeof user !== "object") return null;
  const u = user as Record<string, unknown>;
  if (typeof u.id !== "string" || typeof u.email !== "string") return null;
  return {
    id: u.id,
    email: u.email,
    name: typeof u.name === "string" ? u.name : null,
  };
}

const cloudAuth = new Hono().put("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    token?: unknown;
    user?: unknown;
  } | null;
  const token = body && typeof body.token === "string" ? body.token : null;
  setCloudAuthToken(token);

  const identity = token ? parseIdentity(body?.user) : null;
  if (identity) {
    identifyCloudUser(identity);
  } else if (!token) {
    resetCloudIdentity();
    revertCloudVoiceDefault();
  }
  return c.json({ ok: true });
});

export default cloudAuth;
