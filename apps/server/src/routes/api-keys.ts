import { apiKeySchema } from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import { capture } from "../lib/posthog.js";
import { validateApiKey } from "../lib/validate-key.js";

const apiKeys = new Hono()
  .get("/", (c) => {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT provider, key, created_at, status FROM api_keys ORDER BY created_at DESC",
      )
      .all() as {
      provider: string;
      key: string;
      created_at: string;
      status: string;
    }[];
    // Expose only a last-4 hint so users can tell keys apart in the UI.
    return c.json(
      rows.map(({ key, ...row }) => ({
        ...row,
        hint: key.length > 8 ? `…${key.slice(-4)}` : "…",
      })),
    );
  })
  .get("/:provider", (c) => {
    const db = getDb();
    const provider = c.req.param("provider");
    const row = db
      .prepare(
        "SELECT provider, created_at, status FROM api_keys WHERE provider = ?",
      )
      .get(provider) as
      | { provider: string; created_at: string; status: string }
      | undefined;

    if (!row) {
      return c.json({ error: "No API key for this provider" }, 404);
    }
    return c.json({
      provider: row.provider,
      configured: true,
      created_at: row.created_at,
      status: row.status,
    });
  })
  .post("/", zValidator("json", apiKeySchema), async (c) => {
    const db = getDb();
    const body = c.req.valid("json");

    db.prepare(
      `INSERT INTO api_keys (provider, key, created_at, status) VALUES (?, ?, datetime('now'), 'valid')
       ON CONFLICT(provider) DO UPDATE SET key = excluded.key, created_at = datetime('now'), status = 'valid'`,
    ).run(body.provider, body.key);

    capture("api key configured", { provider: body.provider });

    return c.json({ provider: body.provider, configured: true });
  })
  .post("/validate", zValidator("json", apiKeySchema), async (c) => {
    const body = c.req.valid("json");
    const result = await validateApiKey(body.provider, body.key);
    return c.json({ valid: result.valid, error: result.error });
  })
  .post("/:provider/revalidate", async (c) => {
    const db = getDb();
    const provider = c.req.param("provider");
    const row = db
      .prepare("SELECT key FROM api_keys WHERE provider = ?")
      .get(provider) as { key: string } | undefined;

    if (!row) {
      return c.json({ error: "No API key for this provider" }, 404);
    }

    const result = await validateApiKey(provider, row.key);
    const status = result.valid ? "valid" : "invalid";

    db.prepare("UPDATE api_keys SET status = ? WHERE provider = ?").run(
      status,
      provider,
    );

    return c.json({
      provider,
      valid: result.valid,
      status,
      error: result.error,
    });
  })
  .delete("/:provider", (c) => {
    const db = getDb();
    const provider = c.req.param("provider");
    db.prepare("DELETE FROM api_keys WHERE provider = ?").run(provider);

    capture("api key deleted", { provider });

    return c.json({ ok: true });
  });

export default apiKeys;
