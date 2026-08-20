export type MobileToolPolicy =
  | "connected-read-only"
  | "connected-write"
  | "client-insert"
  | "unsupported";

/**
 * The mobile client can safely show progress for read-only connector calls, but
 * must put writes behind an explicit in-app confirmation.
 */
export function classifyMobileTool(name: string): MobileToolPolicy {
  if (name === "insert_at_cursor") {
    return "client-insert";
  }

  if (/^connector__[a-zA-Z0-9_-]+__ro_[a-zA-Z0-9_]+$/.test(name)) {
    return "connected-read-only";
  }

  if (/^connector__[a-zA-Z0-9_-]+__[a-zA-Z0-9_]+$/.test(name)) {
    return "connected-write";
  }

  return "unsupported";
}
