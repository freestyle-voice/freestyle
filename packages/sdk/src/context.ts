/**
 * A minimal structured logger handed to every plugin via `setup`. Mirrors the
 * shape of the app's Winston logger so plugin authors don't reach for
 * `console`.
 */
export interface PluginLogger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

/**
 * Read-only access to the user's stored settings. Plugins receive a scoped,
 * namespaced view keyed by the plugin name, plus the ability to read global
 * settings values. Writes are intentionally not exposed in V1.
 */
export interface SettingsReader {
  /** Read a global setting value by key, or `undefined` if unset. */
  get(key: string): string | undefined;
  /** Read a value from this plugin's own namespaced settings. */
  getOwn(key: string): string | undefined;
}

/**
 * The execution context delivered to a plugin's `setup` lifecycle hook, once,
 * before any other hook runs. Plugins capture what they need in a closure. It
 * is the same shape in both the server and the Electron main process; the
 * `host` field distinguishes them.
 */
export interface PluginContext {
  /** The plugin's declared `name`. */
  name: string;
  /** Which process is loading this plugin. */
  host: "server" | "app";
  /** Absolute path to the user data directory (db, settings, plugins live here). */
  directory: string;
  /** Structured logger scoped to this plugin. */
  logger: PluginLogger;
  /** Read-only settings access. */
  settings: SettingsReader;
}
