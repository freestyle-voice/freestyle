import type { PluginContext } from "./context.js";
import type { Hooks } from "./hooks.js";

/** Adjusts a plugin's position in hook chains, like Vite's `enforce`. */
export type Enforce = "pre" | "post";

/** The process a plugin is running in. */
export type PluginMode = "server" | "app";

/**
 * Free-form options a plugin can be configured with, supplied as the second
 * element of a `[name, options]` tuple in the `plugins` setting.
 */
export type PluginOptions = Record<string, unknown>;

/**
 * A Freestyle plugin: a named object carrying optional metadata and the hooks
 * it implements (Vite-style). Hooks live flat on the object.
 *
 * A plugin is loaded into both the server and the app process; each hook only
 * runs where it belongs (e.g. `afterCleanup` on the server, `beforeOutput` in
 * the app), so there's no host gating to configure. Use `setup({ mode })` when
 * you need to know which process you're in.
 *
 * @example
 * ```ts
 * import type { Plugin } from "@freestyle/sdk";
 *
 * export default function myPlugin(): Plugin {
 *   return {
 *     name: "freestyle-plugin-my",
 *     enforce: "pre",
 *     setup({ logger, mode }) {
 *       logger.info(`ready on ${mode}`);
 *     },
 *     afterCleanup: (_input, output) => {
 *       output.text = output.text.replace(/\bteh\b/g, "the");
 *     },
 *   };
 * }
 * ```
 */
export interface Plugin extends Hooks {
  /** Required, stable identifier. Shown in logs, telemetry, and settings UI. */
  name: string;
  /** Position in hook chains: `"pre"` first, `"post"` last, unset in between. */
  enforce?: Enforce;
  /**
   * Lifecycle hook run once per host, before any other hook, with the
   * execution context. Capture what you need (logger, settings) in a closure;
   * branch on `ctx.mode` when behavior differs between the server and the app.
   */
  setup?: (ctx: PluginContext) => void | Promise<void>;
  /** Lifecycle hook run once per host on teardown (process shutdown). */
  dispose?: () => void | Promise<void>;
}

/**
 * A plugin entry may be a single plugin, a preset (array of plugins, flattened
 * by the loader), or a falsy value (ignored — handy for conditional enabling).
 */
export type PluginPreset = Plugin | Plugin[] | false | null | undefined;

/**
 * The user-facing factory: a function returning a plugin or preset, optionally
 * configured with options. This is what a plugin module exports.
 */
export type PluginFactory = (options?: PluginOptions) => PluginPreset;

/**
 * The shape of a plugin module. Only the module's **default export** is treated
 * as a {@link PluginFactory}; named exports are ignored by the loader.
 */
export interface PluginModule {
  default?: PluginFactory;
}
