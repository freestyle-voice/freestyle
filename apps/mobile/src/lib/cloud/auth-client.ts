/**
 * Freestyle Cloud auth client for the Expo app.
 *
 * Uses `@better-auth/expo`'s client plugin so social sign-in (Google/GitHub)
 * runs in an in-app browser and deep-links back via the `freestyle://` scheme,
 * with the session cookie persisted in the device keychain (SecureStore).
 * Authenticated requests reuse that cookie via {@link authClient.getCookie}.
 */

import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

import { cloudAuthUrl } from "./config";

export const authClient = createAuthClient({
  baseURL: cloudAuthUrl(),
  plugins: [
    expoClient({
      scheme: "freestyle",
      storagePrefix: "freestyle",
      storage: SecureStore,
    }),
  ],
});
