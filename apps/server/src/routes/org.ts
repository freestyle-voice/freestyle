import { createAppLogger } from "@freestyle-voice/utils";
import { setActiveOrgSchema } from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { formatError } from "../lib/format-error.js";
import {
  clearCachedOrgSlug,
  getCloudActiveOrganization,
  listCloudOrganizations,
  setCloudActiveOrganization,
} from "../lib/freestyle-cloud.js";
import { getSessionToken } from "../lib/sessions.js";

const log = createAppLogger("org");

const org = new Hono()
  /** List all organizations the signed-in user belongs to. */
  .get("/list", async (c) => {
    const token = getSessionToken();
    if (!token) {
      return c.json({ error: "Not signed in to Freestyle Cloud" }, 401);
    }
    try {
      const organizations = await listCloudOrganizations(token);
      return c.json({ organizations });
    } catch (err) {
      log.warn(`failed to list organizations: ${formatError(err)}`);
      return c.json({ error: "Failed to list organizations" }, 502);
    }
  })
  /** Get the user's active organization (or a specific org by ID). */
  .get("/active", async (c) => {
    const token = getSessionToken();
    if (!token) {
      return c.json({ error: "Not signed in to Freestyle Cloud" }, 401);
    }
    const organizationId = c.req.query("organizationId");
    try {
      const organization = await getCloudActiveOrganization(
        token,
        organizationId,
      );
      return c.json({ organization });
    } catch (err) {
      log.warn(`failed to get active organization: ${formatError(err)}`);
      return c.json({ error: "Failed to get organization" }, 502);
    }
  })
  /** Set the user's active organization. */
  .post("/set-active", zValidator("json", setActiveOrgSchema), async (c) => {
    const token = getSessionToken();
    if (!token) {
      return c.json({ error: "Not signed in to Freestyle Cloud" }, 401);
    }
    const { organizationId } = c.req.valid("json");
    try {
      await setCloudActiveOrganization(token, organizationId);
      // The active org changed — drop the cached slug so the next profile/
      // preferences request resolves the new org's slug.
      clearCachedOrgSlug();
      return c.json({ ok: true });
    } catch (err) {
      log.warn(`failed to set active organization: ${formatError(err)}`);
      return c.json({ error: "Failed to set active organization" }, 502);
    }
  });

export default org;
