import { createAppLogger } from "@freestyle-voice/utils";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { formatError } from "../lib/format-error.js";
import { fetchCloudUsage } from "../lib/freestyle-cloud.js";
import { getSessionToken } from "../lib/sessions.js";

const log = createAppLogger("usage");

/**
 * `fresh=1` forces the cloud to bypass its region-local plan cache. The
 * renderer sets it only while polling right after Stripe Checkout so an upgrade
 * is detected on the next poll; all other reads omit it for the cached path.
 */
const usageQuerySchema = z.object({ fresh: z.literal("1").optional() });

const usage = new Hono().get(
  "/",
  zValidator("query", usageQuerySchema),
  async (c) => {
    const token = getSessionToken();
    if (!token) {
      return c.json({ error: "Not signed in to Freestyle Cloud" }, 401);
    }
    try {
      // Forward the caller's `?fresh=1` (set by the post-checkout poll) so the
      // cloud bypasses its plan cache and reports an upgrade immediately.
      const { fresh } = c.req.valid("query");
      const balance = await fetchCloudUsage(token, { fresh: fresh === "1" });
      return c.json(balance);
    } catch (err) {
      log.warn(`failed to fetch cloud usage: ${formatError(err)}`);
      return c.json(
        {
          error: "Failed to fetch usage",
          detail: err instanceof Error ? err.message : String(err),
        },
        502,
      );
    }
  },
);

export default usage;
