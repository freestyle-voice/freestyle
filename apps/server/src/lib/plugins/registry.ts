import type {
  FreestyleEvent,
  Hooks,
  Plugin,
  PluginConfig,
} from "@freestyle/sdk";
import { createAppLogger } from "@freestyle/utils";
import { captureException } from "../posthog.js";

const log = createAppLogger("plugins");

/**
 * Holds the resolved, ordered plugins and runs their hooks. Plugins are already
 * sorted by `enforce` and host-filtered before being handed to the registry, so
 * running a hook is just iterating in order. Every handler is wrapped so one
 * misbehaving plugin can never crash a dictation.
 */
export class PluginRegistry {
  private plugins: Plugin[] = [];

  constructor(plugins: Plugin[] = []) {
    this.plugins = plugins;
  }

  get size(): number {
    return this.plugins.length;
  }

  /**
   * Run a mutating hook across all plugins in resolved order. Each plugin
   * mutates the shared `output` in place; the (mutated) `output` is returned for
   * convenience.
   */
  async run<K extends Exclude<keyof Hooks, "config" | "event">>(
    name: K,
    input: HookInput<K>,
    output: HookOutput<K>,
  ): Promise<HookOutput<K>> {
    for (const plugin of this.plugins) {
      const handler = plugin[name] as
        | ((input: HookInput<K>, output: HookOutput<K>) => unknown)
        | undefined;
      if (!handler) continue;
      try {
        await handler(input, output);
      } catch (err) {
        this.reportFailure(plugin.name, name, err);
      }
    }
    return output;
  }

  /** Broadcast a read-only event to every plugin's `event` hook. */
  async emit(event: FreestyleEvent): Promise<void> {
    for (const plugin of this.plugins) {
      if (!plugin.event) continue;
      try {
        await plugin.event({ event });
      } catch (err) {
        this.reportFailure(plugin.name, "event", err);
      }
    }
  }

  /**
   * Run the `config` hook chain, deep-merging each plugin's returned partial in
   * resolved order on top of the provided base config.
   */
  async resolveConfig(base: PluginConfig): Promise<PluginConfig> {
    let merged = base;
    for (const plugin of this.plugins) {
      if (!plugin.config) continue;
      try {
        const partial = await plugin.config(merged);
        if (partial) merged = deepMerge(merged, partial);
      } catch (err) {
        this.reportFailure(plugin.name, "config", err);
      }
    }
    return merged;
  }

  /** Run every plugin's `dispose` hook (best-effort, on shutdown). */
  async dispose(): Promise<void> {
    for (const plugin of this.plugins) {
      if (!plugin.dispose) continue;
      try {
        await plugin.dispose();
      } catch (err) {
        this.reportFailure(plugin.name, "dispose", err);
      }
    }
  }

  private reportFailure(pluginName: string, hook: string, err: unknown): void {
    log.error(
      `plugin "${pluginName}" failed in hook "${hook}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    captureException(err, { plugin: pluginName, hook });
  }
}

type HookInput<K extends keyof Hooks> =
  NonNullable<Hooks[K]> extends (input: infer I, output: infer _O) => unknown
    ? I
    : never;

type HookOutput<K extends keyof Hooks> =
  NonNullable<Hooks[K]> extends (input: infer _I, output: infer O) => unknown
    ? O
    : never;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const existing = out[key];
    out[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? deepMerge(existing, value)
        : value;
  }
  return out;
}
