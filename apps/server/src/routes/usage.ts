import { createAppLogger } from "@freestyle-voice/utils";
import { Hono } from "hono";
import { formatError } from "../lib/format-error.js";
import { fetchCloudUsage } from "../lib/freestyle-cloud.js";
import { getSessionToken } from "../lib/sessions.js";

const log = createAppLogger("usage");

const usage = new Hono().get("/", async (c) => {
  const token = getSessionToken();
  if (!token) {
    return c.json({ error: "Not signed in to Freestyle Cloud" }, 401);
  }
  try {
    const balance = await fetchCloudUsage(token);
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
});

export default usage;
