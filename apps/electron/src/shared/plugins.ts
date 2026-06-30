import type { PluginUIPage } from "freestyle-voice";

/** Serialized plugin info sent from main to the renderer (no absolute paths). */
export interface PluginInfo {
  name: string;
  /** URL/route-safe id; used for `/plugins/:slug/...` and the asset host. */
  slug: string;
  specifier: string;
  /** Whether the plugin is currently enabled. */
  enabled: boolean;
  /** True when listed in the `plugins` setting but not resolvable on disk. */
  missing?: boolean;
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

/** A catalog entry the user can install from the Browse tab. */
export interface PluginCatalogEntry {
  npmName: string;
  title: string;
  description: string;
  icon?: string;
  homepage?: string;
  author?: string;
}

/** Bounds (in dashboard-window content coordinates) for a hosted plugin view. */
export interface PluginViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
