import type { MiddlewareHandler } from "hono";
import type { PluginConfig } from "./config.js";
import type { FreestyleEvent } from "./events.js";
import type { HookApi } from "./hook-api.js";
import type { Hooks } from "./hooks.js";
import type { Plugin } from "./plugin.js";

/** Details of a hook handler that threw, passed to the host's error reporter. */
export interface HookFailure {
  plugin: string;
  hook: string;
  error: unknown;
}

export interface PluginRegistryOptions {
  /**
   * Called when a hook handler throws. The host decides how to report it
   * (log + telemetry). Handler errors are always swallowed so one plugin can
   * never crash the pipeline.
   */
  onError?: (failure: HookFailure) => void;
}

// The `...rest: never[]` tail makes these tolerant of the handler's arity —
// `Handler<I, O>` takes a third `api` argument, but a plain `extends (input,
// output) => unknown` pattern would only match a strictly 2-parameter
// function and collapse inference to `never` for every real hook.
type HookInput<K extends keyof Hooks> =
  NonNullable<Hooks[K]> extends (
    input: infer I,
    output: infer _O,
    ...rest: never[]
  ) => unknown
    ? I
    : never;

type HookOutput<K extends keyof Hooks> =
  NonNullable<Hooks[K]> extends (
    input: infer _I,
    output: infer O,
    ...rest: never[]
  ) => unknown
    ? O
    : never;

/**
 * Holds the resolved, ordered plugins and runs their hooks. Plugins are already
 * sorted by `enforce` and host-filtered before being handed to the registry, so
 * running a hook is just iterating in order. Every handler is wrapped so one
 * misbehaving plugin can never crash the host pipeline; failures are routed to
 * the injected `onError` reporter.
 */
export class PluginRegistry {
  private plugins: Plugin[];
  private onError?: (failure: HookFailure) => void;

  private disposed = false;

  constructor(plugins: Plugin[] = [], options: PluginRegistryOptions = {}) {
    this.plugins = plugins;
    this.onError = options.onError;
  }

  get size(): number {
    return this.plugins.length;
  }

  /**
   * Whether any loaded plugin implements the given hook. Used by hosts to
   * decide whether it's worth taking a slower code path just to guarantee a
   * hook fires (e.g. Freestyle Cloud's combined STT+cleanup mode is skipped in
   * favor of the slower two-step path when a plugin implements
   * `beforeTranscribe`/`afterTranscribe`/`beforeCleanup`, none of which would
   * otherwise fire).
   */
  has<K extends keyof Hooks>(name: K): boolean {
    return this.plugins.some((plugin) => typeof plugin[name] === "function");
  }

  /**
   * Collect all middleware contributed by plugins, in resolved order. Each
   * plugin's `middleware` array is flattened into a single ordered list.
   */
  collectMiddleware(): MiddlewareHandler[] {
    const handlers: MiddlewareHandler[] = [];
    for (const plugin of this.plugins) {
      if (plugin.middleware) {
        for (const mw of plugin.middleware) {
          handlers.push(mw);
        }
      }
    }
    return handlers;
  }

  /**
   * Run a mutating hook across all plugins in resolved order. Each plugin
   * mutates the shared `output` in place; the (mutated) `output` is returned for
   * convenience.
   *
   * `api` is required — build one with {@link createHookApi} (or reuse the same
   * one across every stage of a single dictation so `api.control` is shared).
   * Iteration stops early when `api.control.propagationStopped` is set, either
   * by `stopPropagation()` (this hook only) or `consume()`/`abort()` (the whole
   * pipeline — callers check `api.control.state` after `run()` returns to skip
   * subsequent stages). The propagation flag is reset for this hook before
   * iterating, so a `stopPropagation()` in an earlier hook doesn't bleed into
   * later ones.
   */
  async run<K extends Exclude<keyof Hooks, "config" | "event">>(
    name: K,
    input: HookInput<K>,
    output: HookOutput<K>,
    api: HookApi,
  ): Promise<HookOutput<K>> {
    api.control.resetPropagationForNextHook();
    for (const plugin of this.plugins) {
      if (api.control.propagationStopped) break;
      const handler = plugin[name] as
        | ((
            input: HookInput<K>,
            output: HookOutput<K>,
            api: HookApi,
          ) => unknown)
        | undefined;
      if (!handler) continue;
      try {
        await handler(input, output, api);
      } catch (err) {
        this.report(plugin.name, name, err);
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
        this.report(plugin.name, "event", err);
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
        this.report(plugin.name, "config", err);
      }
    }
    return merged;
  }

  /**
   * Run every plugin's `dispose` hook (best-effort, on shutdown). Idempotent —
   * safe to call from multiple shutdown seams; only the first call runs.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const plugin of this.plugins) {
      if (!plugin.dispose) continue;
      try {
        await plugin.dispose();
      } catch (err) {
        this.report(plugin.name, "dispose", err);
      }
    }
  }

  private report(plugin: string, hook: string, error: unknown): void {
    this.onError?.({ plugin, hook, error });
  }
}

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
