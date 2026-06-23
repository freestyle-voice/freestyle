/**
 * Configuration surfaced to (and contributed by) the `config` hook.
 *
 * Intentionally a loose, open-ended record in V1 so the contract can grow
 * without breaking plugins. The loader deep-merges each plugin's returned
 * partial in resolved plugin order.
 */
export interface PluginConfig {
  [key: string]: unknown;
}
