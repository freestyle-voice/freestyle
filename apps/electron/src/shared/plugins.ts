import type { PluginUIPage } from "@freestyle/sdk";

/** Serialized plugin info sent from main to the renderer (no absolute paths). */
export interface PluginInfo {
  name: string;
  /** URL/route-safe id; used for `/plugins/:slug/...` and the asset host. */
  slug: string;
  specifier: string;
  local: boolean;
  description?: string;
  author?: string;
  pages: PluginUIPage[];
}

/** Bounds (in dashboard-window content coordinates) for a hosted plugin view. */
export interface PluginViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
