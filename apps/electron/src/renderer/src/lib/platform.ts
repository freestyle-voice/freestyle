export const PLATFORM: string =
  (typeof window !== "undefined" && window.api?.platform) ||
  (typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
    ? "darwin"
    : "unknown");

export const IS_MAC = PLATFORM === "darwin";
export const IS_WINDOWS = PLATFORM === "win32";
export const IS_LINUX = PLATFORM === "linux";

export const MOD_LABEL = IS_MAC ? "⌘" : "Ctrl+";
export const SEARCH_SHORTCUT_LABEL = IS_MAC ? "⌘ K" : "Ctrl+K";
