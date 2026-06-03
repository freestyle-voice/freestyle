import { apiKeySchema } from "@freestyle/validations";
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
        "SELECT provider, created_at, status FROM api_keys ORDER BY created_at DESC",
      )
      .all() as { provider: string; created_at: string; status: string }[];
    return c.json(rows);
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

    // Validate the key before saving
    const result = await validateApiKey(body.provider, body.key);

    const status = result.valid ? "valid" : "invalid";

    db.prepare(
      `INSERT INTO api_keys (provider, key, created_at, status) VALUES (?, ?, datetime('now'), ?)
       ON CONFLICT(provider) DO UPDATE SET key = excluded.key, created_at = datetime('now'), status = ?`,
    ).run(body.provider, body.key, status, status);

    capture("api key configured", { provider: body.provider, status });

    if (!result.valid) {
      return c.json(
        {
          provider: body.provider,
          configured: true,
          valid: false,
          error: result.error,
        },
        200,
      );
    }

    return c.json({ provider: body.provider, configured: true, valid: true });
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
