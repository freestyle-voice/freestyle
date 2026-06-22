import type { PluginContext } from "./context.js";
import type { Hooks } from "./hooks.js";

/**
 * Free-form options a plugin can be configured with, supplied either as the
 * second element of a `[name, options]` tuple in the `plugins` setting or via
 * the plugin's own namespaced settings.
 */
export type PluginOptions = Record<string, unknown>;

/**
 * A Freestyle plugin: an async factory that receives its execution context and
 * returns the hooks it implements. The factory runs once per process at load
 * time; the returned hooks run many times across the dictation pipeline.
 *
 * @example
 * ```ts
 * import type { Plugin } from "@freestyle/sdk";
 *
 * export const MyPlugin: Plugin = async ({ logger }) => {
 *   logger.info("ready");
 *   return {
 *     "text.transform": async (_input, output) => {
 *       output.text = output.text.replace(/\bteh\b/g, "the");
 *     },
 *   };
 * };
 * ```
 */
export type Plugin = (
  context: PluginContext,
  options?: PluginOptions,
) => Promise<Hooks> | Hooks;

/**
 * The shape of a plugin module. A module's default export, or any named export
 * that is a function, is treated as a {@link Plugin}.
 */
export interface PluginModule {
  default?: Plugin;
  [name: string]: Plugin | undefined;
}
