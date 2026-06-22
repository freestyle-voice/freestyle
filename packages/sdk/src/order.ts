import type { Enforce, Plugin } from "./plugin.js";

const RANK: Record<"pre" | "none" | "post", number> = {
  pre: 0,
  none: 1,
  post: 2,
};

function rank(enforce?: Enforce): number {
  return RANK[enforce ?? "none"];
}

/**
 * Order plugins for hook execution, mirroring Vite's `enforce` semantics:
 * `"pre"` plugins first, then unenforced, then `"post"`. The sort is **stable**
 * — load order is preserved within each band.
 */
export function sortPlugins(plugins: readonly Plugin[]): Plugin[] {
  return plugins
    .map((plugin, index) => ({ plugin, index }))
    .sort(
      (a, b) =>
        rank(a.plugin.enforce) - rank(b.plugin.enforce) || a.index - b.index,
    )
    .map((entry) => entry.plugin);
}
