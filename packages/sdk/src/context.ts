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

/** A minimal string-only logger, e.g. a winston logger from the host. */
export interface BaseLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Adapt a host's string logger into the {@link PluginLogger} shape, folding the
 * optional `extra` object into the message. Shared by both hosts so the plugin
 * logging format stays identical.
 */
export function createPluginLogger(base: BaseLogger): PluginLogger {
  const fmt = (message: string, extra?: Record<string, unknown>): string =>
    extra ? `${message} ${JSON.stringify(extra)}` : message;
  return {
    debug: (message, extra) => base.debug(fmt(message, extra)),
    info: (message, extra) => base.info(fmt(message, extra)),
    warn: (message, extra) => base.warn(fmt(message, extra)),
    error: (message, extra) => base.error(fmt(message, extra)),
  };
}

/**
 * Read-only access to the user's stored settings. Plugins receive a scoped,
 * namespaced view keyed by the plugin name, plus the ability to read global
 * settings values.
 */
export interface SettingsReader {
  /** Read a global setting value by key, or `undefined` if unset. */
  get(key: string): string | undefined;
  /** Read a value from this plugin's own namespaced settings. */
  getOwn(key: string): string | undefined;
}

/**
 * Per-plugin persistent key-value storage. Values are JSON-serialized into the
 * host's database, automatically scoped by the plugin's name so plugins can
 * never collide. Think of it as `localStorage` for plugins — simple, durable,
 * and portable across machines when the database is synced.
 */
export interface PluginStorage {
  /** Read a stored value by key. Returns `undefined` if unset. */
  get<T = unknown>(key: string): Promise<T | undefined>;
  /** Write a JSON-serializable value by key. */
  set(key: string, value: unknown): Promise<void>;
  /** Remove a key. */
  delete(key: string): Promise<void>;
}

/**
 * Access to the host's configured language model, exposed to server-side
 * plugins so they can run their own LLM calls (classification, tool-calling
 * agents, etc.) reusing the user's default cleanup model and API keys — no
 * separate provider or key configuration required.
 *
 * Present only in the server process (`mode: "server"`) and only when the user
 * has a default LLM model configured. Always guard with `if (ctx.llm)`.
 */
export interface PluginLlm {
  /**
   * Resolve a ready-to-use AI SDK `LanguageModel` backed by the user's default
   * cleanup model and stored provider key. Pass the returned value straight to
   * the AI SDK's `generateText` / `streamText` `model` option.
   *
   * Typed as `unknown` in the SDK to avoid a hard dependency on the `ai`
   * package; cast to `LanguageModel` (from `ai`) at the call site.
   */
  getModel(): unknown;
  /** The provider id of the resolved model (e.g. "openai", "groq"). */
  readonly providerId: string;
  /** The model id of the resolved model. */
  readonly modelId: string;
}

/**
 * The execution context delivered to a plugin's `setup` lifecycle hook, once
 * per host, before any other hook runs. Plugins capture what they need in a
 * closure. It is the same shape in both the server and the Electron main
 * process; the `mode` field distinguishes them.
 */
export interface PluginContext {
  /** The plugin's declared `name`. */
  name: string;
  /** Which process this plugin is running in. */
  mode: "server" | "app";
  /** Absolute path to the user data directory (db, settings, plugins live here). */
  directory: string;
  /** Structured logger scoped to this plugin. */
  logger: PluginLogger;
  /** Read-only settings access. */
  settings: SettingsReader;
  /** Per-plugin persistent storage (JSON key-value, scoped by plugin name). */
  storage: PluginStorage;
  /**
   * [server] Access to the host's configured LLM. Present only in the server
   * process and only when a default LLM model is configured; `undefined`
   * otherwise. Always guard with `if (ctx.llm)`.
   */
  llm?: PluginLlm;
}
