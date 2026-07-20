/**
 * Bearer-token auth header for the configured Freestyle server. Shared by the
 * main process, the renderer API client, and the plugin view host so the header
 * shape lives in exactly one place. Returns an empty object when no token is
 * set (the default local-server case), so loopback requests are unaffected.
 */
export function bearerAuthHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
