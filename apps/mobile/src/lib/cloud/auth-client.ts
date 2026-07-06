/**
 * Shared better-auth client configured for Freestyle Cloud. Uses the same
 * `deviceAuthorizationClient` plugin the desktop relies on, so the OAuth 2.0
 * device flow behaves identically. The client is pure `fetch`, which runs
 * fine in React Native.
 */

import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

import { cloudAuthUrl } from "./config";

export function createCloudAuthClient() {
  return createAuthClient({
    baseURL: cloudAuthUrl(),
    disableDefaultFetchPlugins: true,
    plugins: [deviceAuthorizationClient()],
  });
}
