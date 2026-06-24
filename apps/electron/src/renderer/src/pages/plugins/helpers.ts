import type { PluginInfo } from "@shared/plugins";
import { type LucideIcon, icons as lucideIcons, Puzzle } from "lucide-react";

/**
 * Resolve a lucide icon by name, accepting PascalCase (`FileMusic`) or
 * kebab-case (`file-music`). Falls back to a puzzle piece.
 */
export function resolvePluginIcon(name: string | undefined): LucideIcon {
  if (!name) return Puzzle;
  const pascal = name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  return (lucideIcons as Record<string, LucideIcon>)[pascal] ?? Puzzle;
}

/**
 * Turn a package name into a friendly title: strip the scope and any
 * `(freestyle-)plugin-` prefix, then Title Case the remaining words.
 */
export function pluginDisplayName(plugin: PluginInfo): string {
  const base = plugin.name
    .replace(/^@[^/]+\//, "")
    .replace(/^freestyle-plugin-/, "")
    .replace(/^plugin-/, "");
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
