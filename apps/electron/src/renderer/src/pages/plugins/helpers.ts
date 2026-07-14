import { ONE_HOUR } from "@renderer/lib/query";
import type { PluginInfo, PluginUpdateResult } from "@shared/plugins";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Braces,
  Code,
  FileMusic,
  FileText,
  Filter,
  Globe,
  Languages,
  type LucideIcon,
  MessageSquare,
  Mic,
  Music,
  Puzzle,
  Settings,
  Shield,
  Sparkles,
  Star,
  Terminal,
  Type,
  Volume2,
  Wand2,
  Zap,
} from "lucide-react";
import { useMemo } from "react";

// Curated icon set for plugin manifests. Importing the whole lucide `icons`
// barrel pulled ~1500 icons into the bundle just to resolve one by name;
// plugins pick from this list and anything else falls back to the puzzle piece.
const PLUGIN_ICONS: Record<string, LucideIcon> = {
  Bot,
  Braces,
  Code,
  FileMusic,
  FileText,
  Filter,
  Globe,
  Languages,
  MessageSquare,
  Mic,
  Music,
  Puzzle,
  Settings,
  Shield,
  Sparkles,
  Star,
  Terminal,
  Type,
  Volume2,
  Wand2,
  Zap,
};

/**
 * Resolve a curated lucide icon by name, accepting PascalCase (`FileMusic`) or
 * kebab-case (`file-music`). Falls back to a puzzle piece.
 */
export function resolvePluginIcon(name: string | undefined): LucideIcon {
  if (!name) return Puzzle;
  const pascal = name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  return PLUGIN_ICONS[pascal] ?? Puzzle;
}

/**
 * Return the plugin's display name. Prefers `freestyle.displayName` from the
 * manifest; falls back to deriving a friendly title from the package name
 * (strip scope and `(freestyle-)plugin-` prefix, then Title Case).
 */
export function pluginDisplayName(plugin: PluginInfo): string {
  if (plugin.displayName) return plugin.displayName;
  const base = plugin.name
    .replace(/^@[^/]+\//, "")
    .replace(/^freestyle-plugin-/, "")
    .replace(/^plugin-/, "")
    .replace(/-dev$/, "");
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Shared hook for checking plugin updates. Uses a stable query key family so
 * caching is shared between the plugins list and detail pages.
 */
export function usePluginUpdates(plugins: PluginInfo[]) {
  const entries = useMemo(
    () =>
      plugins
        .filter((p) => p.version && !p.missing)
        .map((p) => ({ name: p.specifier, currentVersion: p.version! })),
    [plugins],
  );

  return useQuery({
    queryKey: ["plugin-updates", entries],
    queryFn: async () => {
      if (entries.length === 0) return new Map<string, PluginUpdateResult>();
      const results = await window.api.checkPluginUpdates(entries);
      return new Map(results.map((r) => [r.name, r]));
    },
    staleTime: ONE_HOUR,
    retry: 1,
    enabled: entries.length > 0,
  });
}
