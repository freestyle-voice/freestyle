/**
 * Shared Freestyle Cloud HTTP client, configured for mobile. Wraps the
 * runtime-agnostic client from `@freestyle-voice/utils/cloud` with the mobile
 * specifics: base URL from expo-constants (`cloudUrl`), cookie-based auth
 * (`authHeaders`), and `credentials: "omit"`.
 *
 * This is the mobile analogue of the desktop server's `cloudJson` — the same
 * retry, timeout, and 401/429/!ok error taxonomy, so authenticated cloud calls
 * no longer repeat that boilerplate per file.
 */

import { createCloudClient } from "@freestyle-voice/utils/cloud";
import { cloudUrl } from "./config";
import { authHeaders } from "./session";

/**
 * The authenticated cloud client. `getAuthHeaders` returns the session cookie
 * (or null when signed out, which makes `cloud.json` throw `CloudAuthError`
 * before issuing the request). The default 15s timeout matches the previous
 * per-call value used by the preferences/profile endpoints; usage overrides it
 * to 10s per-request.
 */
export const cloud = createCloudClient({
  getBaseUrl: cloudUrl,
  getAuthHeaders: authHeaders,
  credentials: "omit",
  defaultTimeoutMs: 15_000,
});
