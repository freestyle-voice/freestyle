import { randomBytes } from "node:crypto";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { StoredMcpOAuth } from "./store.js";

const CALLBACK_URL = "http://127.0.0.1:4649/api/mcp/oauth/callback";
const OAUTH_STATE_TTL_MS = 10 * 60_000;

type OAuthStore = {
  getOAuth(connectionId: string): StoredMcpOAuth | undefined;
  saveOAuth(connectionId: string, oauth: StoredMcpOAuth): void;
};

export type OAuthCallbackResult =
  | { ok: true; code: string }
  | { ok: false; reason: "invalid-state" | "expired-state" };

export function validateMcpOAuthCallback(
  pending: Pick<StoredMcpOAuth, "state" | "stateExpiresAt"> | undefined,
  callback: { state?: string | null; code?: string | null },
  now = Date.now(),
): OAuthCallbackResult {
  if (
    !pending?.state ||
    !callback.state ||
    pending.state !== callback.state ||
    !callback.code
  ) {
    return { ok: false, reason: "invalid-state" };
  }
  if (!pending.stateExpiresAt || pending.stateExpiresAt <= now) {
    return { ok: false, reason: "expired-state" };
  }
  return { ok: true, code: callback.code };
}

/**
 * A persisted OAuth provider for one local MCP connection. The MCP SDK drives
 * discovery, dynamic registration, PKCE, refresh, and resource validation;
 * this adapter only owns durable device-local storage and the browser handoff.
 */
export function createMcpOAuthProvider(
  connectionId: string,
  store: OAuthStore,
  onAuthorizationUrl?: (url: URL) => void,
): OAuthClientProvider {
  const current = (): StoredMcpOAuth => store.getOAuth(connectionId) ?? {};
  const save = (next: StoredMcpOAuth): void =>
    store.saveOAuth(connectionId, next);

  return {
    get redirectUrl() {
      return CALLBACK_URL;
    },
    get clientMetadata() {
      return {
        client_name: "Freestyle",
        redirect_uris: [CALLBACK_URL],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      };
    },
    async state() {
      const existing = current();
      if (existing.state && (existing.stateExpiresAt ?? 0) > Date.now()) {
        return existing.state;
      }
      const state = randomBytes(32).toString("base64url");
      save({ state, stateExpiresAt: Date.now() + OAUTH_STATE_TTL_MS });
      return state;
    },
    clientInformation: () => current().clientInformation as never,
    saveClientInformation: (clientInformation) =>
      save({ clientInformation: clientInformation as Record<string, unknown> }),
    tokens: () => current().tokens as never,
    saveTokens: (tokens) => save({ tokens: tokens as Record<string, unknown> }),
    redirectToAuthorization: (url) => onAuthorizationUrl?.(url),
    saveCodeVerifier: (codeVerifier) => save({ codeVerifier }),
    codeVerifier: () => {
      const verifier = current().codeVerifier;
      if (!verifier)
        throw new Error("MCP OAuth authorization has expired. Connect again.");
      return verifier;
    },
    saveDiscoveryState: (discovery) =>
      save({ discovery: discovery as unknown as Record<string, unknown> }),
    discoveryState: () => current().discovery as never,
    invalidateCredentials: (scope) => {
      if (scope === "tokens" || scope === "all") save({ tokens: {} });
      if (scope === "client" || scope === "all")
        save({ clientInformation: {} });
      if (scope === "verifier" || scope === "all")
        save({ codeVerifier: "", state: "", stateExpiresAt: 0 });
      if (scope === "discovery" || scope === "all") save({ discovery: {} });
    },
  };
}
