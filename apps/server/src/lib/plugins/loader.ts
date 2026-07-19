import path from "node:path";
import { createAppLogger } from "@freestyle-voice/utils";
import {
  parseDisabledPlugins,
  parsePluginsSetting,
  pluginEntryParts,
} from "@freestyle-voice/validations";
import type { HookFailure, Plugin, PluginEntry } from "freestyle-voice";
import {
  defaultLocalPluginsDir,
  loadPlugins,
  type PluginRegistry,
  pluginSlug,
} from "freestyle-voice";
import { readSetting } from "../db.js";
import { captureException } from "../posthog.js";
import { buildPluginContext } from "./context.js";

const log = createAppLogger("plugins");

/**
 * Load all plugins for the server process via the shared SDK loader, returning
 * a ready-to-use {@link PluginRegistry}. Sources, in load order: built-in
 * plugins (always present), npm/module specifiers from the `plugins` setting,
 * then local files in `<userData>/plugins/`. Specifiers in `disabled_plugins`
 * are skipped; built-in plugins are never skippable.
 */
export async function loadServerPlugins(
  builtin: Plugin[] = [],
): Promise<PluginRegistry> {
  const disabled = new Set(
    parseDisabledPlugins(readSetting("disabled_plugins")),
  );
  const entries: PluginEntry[] = parsePluginsSetting(readSetting("plugins"))
    .map((entry) => pluginEntryParts(entry))
    .filter((entry) => !disabled.has(entry.specifier));
  const localDir = defaultLocalPluginsDir();

  // Disabled specifiers are package names; local-dir plugins are laid out by
  // their slug (`<localDir>/<slug>/…` or `<localDir>/<slug>.js`). Compare on the
  // slug so a disabled dev-linked plugin's hooks stay off.
  const disabledSlugs = new Set([...disabled].map((s) => pluginSlug(s)));
  const isLocalDisabled = (entryPath: string): boolean => {
    if (!localDir) return false;
    const rel = path.relative(localDir, entryPath);
    const first = rel.split(path.sep)[0] ?? "";
    const slug = first.replace(/\.(ts|js|mjs)$/, "");
    return disabledSlugs.has(slug);
  };

  return loadPlugins({
    entries,
    builtin,
    ...(localDir ? { localDir } : {}),
    isLocalDisabled,
    buildContext: buildPluginContext,
    logger: log,
    onError: reportHookFailure,
  });
}

function reportHookFailure({ plugin, hook, error }: HookFailure): void {
  log.error(
    `plugin "${plugin}" failed in hook "${hook}": ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  captureException(error, { plugin, hook });
}
