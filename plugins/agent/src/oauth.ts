import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { PluginStorage } from "freestyle-voice";
import { openUrl } from "./mcp/tools/system.js";

/**
 * Pending OAuth flows keyed by server id. When an OAuth-configured server
 * triggers `redirectToAuthorization()`, we store its transport here so the
 * callback endpoint (which carries the server id in its path) can call
 * `finishAuth(code)` on the exact transport — supporting multiple concurrent
 * OAuth MCP servers.
 */
export const pendingOAuthTransports = new Map<
  string,
  StreamableHTTPClientTransport
>();

function serverPort(): number {
  return process.env.PORT ? Number(process.env.PORT) : 4649;
}

/**
 * OAuthClientProvider backed by PluginStorage. Persists tokens, client
 * registration, PKCE verifier, and discovery state per-server so they survive
 * across app restarts.
 */
export class PluginOAuthProvider implements OAuthClientProvider {
  private readonly serverId: string;
  private readonly storage: PluginStorage;
  private readonly slug: string;

  constructor(serverId: string, storage: PluginStorage, pluginSlug: string) {
    this.serverId = serverId;
    this.storage = storage;
    this.slug = pluginSlug;
  }

  private key(suffix: string): string {
    return `oauth:${this.serverId}:${suffix}`;
  }

  get redirectUrl(): string {
    const port = serverPort();
    // Encode the server id in the callback path so, with multiple OAuth MCP
    // servers, the callback can route the code to the exact transport. Each
    // server registers (via DCR) its own unique redirect URI.
    return `http://127.0.0.1:${port}/api/plugins/${this.slug}/agent/oauth/callback/${encodeURIComponent(this.serverId)}`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [new URL(this.redirectUrl)] as unknown as string[],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "Freestyle Voice Agent",
      token_endpoint_auth_method: "none",
    } as OAuthClientMetadata;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return this.storage.get<OAuthClientInformationMixed>(this.key("client"));
  }

  async saveClientInformation(
    info: OAuthClientInformationMixed,
  ): Promise<void> {
    await this.storage.set(this.key("client"), info);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return this.storage.get<OAuthTokens>(this.key("tokens"));
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.storage.set(this.key("tokens"), tokens);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    await openUrl({ url: authorizationUrl.toString() });
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.storage.set(this.key("verifier"), codeVerifier);
  }

  async codeVerifier(): Promise<string> {
    const v = await this.storage.get<string>(this.key("verifier"));
    if (!v) throw new Error("No PKCE code verifier saved for this session");
    return v;
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    if (scope === "all" || scope === "tokens") {
      await this.storage.delete(this.key("tokens"));
    }
    if (scope === "all" || scope === "client") {
      await this.storage.delete(this.key("client"));
    }
    if (scope === "all" || scope === "verifier") {
      await this.storage.delete(this.key("verifier"));
    }
    if (scope === "all" || scope === "discovery") {
      await this.storage.delete(this.key("discovery"));
    }
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    await this.storage.set(this.key("discovery"), state);
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    return this.storage.get<OAuthDiscoveryState>(this.key("discovery"));
  }
}

/** Check whether tokens exist for a given server. */
export async function hasOAuthTokens(
  serverId: string,
  storage: PluginStorage,
): Promise<boolean> {
  const tokens = await storage.get<OAuthTokens>(`oauth:${serverId}:tokens`);
  return !!tokens?.access_token;
}

/** Delete all OAuth data for a given server. */
export async function clearOAuthData(
  serverId: string,
  storage: PluginStorage,
): Promise<void> {
  await Promise.all([
    storage.delete(`oauth:${serverId}:tokens`),
    storage.delete(`oauth:${serverId}:client`),
    storage.delete(`oauth:${serverId}:verifier`),
    storage.delete(`oauth:${serverId}:discovery`),
  ]);
}
