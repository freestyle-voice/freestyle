import type { PluginUIPage } from "@freestyle/sdk";

/** Serialized plugin info sent from main to the renderer (no absolute paths). */
export interface PluginInfo {
  name: string;
  /** URL/route-safe id; used for `/plugins/:slug/...` and the asset host. */
  slug: string;
  specifier: string;
  local: boolean;
  /** Whether the plugin is currently enabled. */
  enabled: boolean;
  /** Plugin version from its `package.json`, when present. */
  version?: string;
  description?: string;
  author?: string;
  /** Plugin-level icon name (lucide) declared via `freestyle.icon`. */
  icon?: string;
  /** Raw README markdown shipped with the plugin, when present. */
  readme?: string;
  pages: PluginUIPage[];
}

/** Bounds (in dashboard-window content coordinates) for a hosted plugin view. */
export interface PluginViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
