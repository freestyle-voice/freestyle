/**
 * Generates opaque client-side IDs for local threads and streamed messages.
 * These IDs are correlation keys, not secrets, so React Native's built-in
 * random source is sufficient and avoids assuming a browser crypto global.
 */
export function createMobileId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timestamp}-${random}`;
}
