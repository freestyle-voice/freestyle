import { createAppLogger } from "@freestyle-voice/utils";
import { Hono } from "hono";
import { formatError } from "../lib/format-error.js";
import {
  type CloudPricing,
  fetchCloudPricing,
} from "../lib/freestyle-cloud.js";

const log = createAppLogger("pricing");

/**
 * USD fallback when the cloud pricing endpoint is unreachable. Mirrors the
 * marketing site's hardcoded defaults so the UI never renders blank prices.
 */
const FALLBACK_PRICING: CloudPricing = {
  currency: "usd",
  monthly: { amount: 1200, display: "$12" },
  annual: { amount: 900, display: "$9" },
};

/**
 * Public passthrough for Freestyle Cloud geo-aware pricing
 * (`GET /v2/pricing`). Unauthenticated — currency comes from the caller's IP
 * geo on the cloud side. Always returns a pricing payload: on upstream
 * failure we fall back to USD so the upgrade UI stays usable offline.
 */
const pricing = new Hono().get("/", async (c) => {
  try {
    const data = await fetchCloudPricing();
    return c.json(data);
  } catch (err) {
    log.warn(
      `failed to fetch cloud pricing, using USD fallback: ${formatError(err)}`,
    );
    return c.json(FALLBACK_PRICING);
  }
});

export default pricing;
