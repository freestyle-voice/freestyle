/**
 * A minimal structured logger handed to every plugin. Mirrors the shape of the
 * app's Winston logger so plugin authors don't need to reach for `console`.
 */
export interface PluginLogger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

/**
 * Read-only access to the user's stored settings. Plugins receive a scoped,
 * namespaced view keyed by the plugin id, plus the ability to read global
 * settings values. Writes are intentionally not exposed in V1.
 */
export interface SettingsReader {
  /** Read a global setting value by key, or `undefined` if unset. */
  get(key: string): string | undefined;
  /** Read a value from this plugin's own namespaced settings. */
  getOwn(key: string): string | undefined;
}

/**
 * The execution context every plugin factory receives. It is the same shape in
 * both the server and the Electron main process; process-specific hooks simply
 * go unused in the process that doesn't run them.
 */
export interface PluginContext {
  /** Stable identifier derived from the plugin's package/file name. */
  id: string;
  /** Which process is loading this plugin. */
  host: "server" | "app";
  /** Absolute path to the user data directory (db, settings, plugins live here). */
  directory: string;
  /** Structured logger scoped to this plugin. */
  logger: PluginLogger;
  /** Read-only settings access. */
  settings: SettingsReader;
}
