// In-memory holder for the Freestyle Cloud session bearer token.
//
// The Electron main process owns the token (encrypted at rest via the OS
// keychain / safeStorage) and pushes it here — at server startup and whenever
// it changes via `PUT /api/cloud-auth`. It is deliberately never written to the
// SQLite settings/api_keys tables.

let cloudAuthToken: string | null = null;

export function getCloudAuthToken(): string | null {
  return cloudAuthToken;
}

export function setCloudAuthToken(token: string | null | undefined): void {
  cloudAuthToken = token && token.length > 0 ? token : null;
}
