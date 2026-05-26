declare const FREESTYLE_CLI_VERSION: string | undefined;

export const VERSION =
  typeof FREESTYLE_CLI_VERSION === "string"
    ? FREESTYLE_CLI_VERSION
    : "0.0.0-dev";

export const DEFAULT_PORT = 4649;

export function getBaseUrl(port: number): string {
  return `http://localhost:${String(port)}`;
}
