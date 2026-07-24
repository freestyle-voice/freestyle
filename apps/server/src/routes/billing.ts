import { createAppLogger } from "@freestyle-voice/utils";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { formatError } from "../lib/format-error.js";
import {
  createBillingPortalSession,
  createCheckoutSession,
} from "../lib/freestyle-cloud.js";
import { getSessionToken } from "../lib/sessions.js";

const log = createAppLogger("billing");

const checkoutSchema = z.object({
  period: z.enum(["monthly", "annual"]),
});

/**
 * Local proxy for Freestyle Cloud billing (Stripe). Mirrors the usage route's
 * contract: 401 when not signed in, 502 when the cloud call fails. Both
 * endpoints return `{ url }` — a Stripe-hosted page the renderer opens in the
 * system browser.
 */
const billing = new Hono()
  .post("/checkout", zValidator("json", checkoutSchema), async (c) => {
    const token = getSessionToken();
    if (!token) {
      return c.json({ error: "Not signed in to Freestyle Cloud" }, 401);
    }
    const { period } = c.req.valid("json");
    try {
      const { url } = await createCheckoutSession(token, {
        annual: period === "annual",
      });
      return c.json({ url });
    } catch (err) {
      log.warn(`failed to create checkout session: ${formatError(err)}`);
      return c.json(
        {
          error: "Failed to start checkout",
          detail: err instanceof Error ? err.message : String(err),
        },
        502,
      );
    }
  })
  .post("/portal", async (c) => {
    const token = getSessionToken();
    if (!token) {
      return c.json({ error: "Not signed in to Freestyle Cloud" }, 401);
    }
    try {
      const { url } = await createBillingPortalSession(token);
      return c.json({ url });
    } catch (err) {
      log.warn(`failed to create billing portal session: ${formatError(err)}`);
      return c.json(
        {
          error: "Failed to open billing portal",
          detail: err instanceof Error ? err.message : String(err),
        },
        502,
      );
    }
  });

export default billing;
