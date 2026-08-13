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
import { pullCloudPreferences } from "../lib/preferences-sync.js";
import { getSessionToken } from "../lib/sessions.js";
import { clearOutbox } from "../lib/sync-outbox.js";

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
      // Member preferences (cleanup tones, languages, vocabulary) are per-org,
      // so everything scoped to the previous org is now stale:
      //   - drop the cached slug so subsequent requests resolve the new org's,
      clearCachedOrgSlug();
      //   - clear the outbox so patches queued for the previous org can't be
      //     delivered to the new one (rows are keyed by field, not org),
      clearOutbox();
      //   - reload the new org's snapshot into the local settings/vocabulary
      //     tables so the app reflects the switch immediately (like sign-in).
      await pullCloudPreferences();
      return c.json({ ok: true });
    } catch (err) {
      log.warn(`failed to set active organization: ${formatError(err)}`);
      return c.json({ error: "Failed to set active organization" }, 502);
    }
  });

export default org;
