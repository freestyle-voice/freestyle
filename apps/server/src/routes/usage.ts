import { Hono } from "hono";
import { fetchCloudUsage } from "../lib/freestyle-cloud.js";
import { getSessionToken } from "../lib/sessions.js";

const usage = new Hono().get("/", async (c) => {
  const token = getSessionToken();
  if (!token) {
    return c.json({ error: "Not signed in to Freestyle Cloud" }, 401);
  }
  try {
    const balance = await fetchCloudUsage(token);
    return c.json(balance);
  } catch (err) {
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
