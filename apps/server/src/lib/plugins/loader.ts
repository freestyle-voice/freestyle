import { createAppLogger } from "@freestyle-voice/utils";
import {
  parseDisabledPlugins,
  parsePluginsSetting,
  pluginEntryParts,
} from "@freestyle-voice/validations";
import type { HookFailure, PluginEntry } from "freestyle-voice";
import {
  defaultLocalPluginsDir,
  loadPlugins,
  type PluginRegistry,
} from "freestyle-voice";
import { readSetting } from "../db.js";
import { captureException } from "../posthog.js";
import { buildPluginContext } from "./context.js";

const log = createAppLogger("plugins");

/**
 * Load all plugins for the server process via the shared SDK loader, returning
 * a ready-to-use {@link PluginRegistry}. Sources, in load order: npm/module
 * specifiers from the `plugins` setting, then local files in
 * `<userData>/plugins/`. Specifiers in `disabled_plugins` are skipped.
 */
export async function loadServerPlugins(): Promise<PluginRegistry> {
  const disabled = new Set(
    parseDisabledPlugins(readSetting("disabled_plugins")),
  );
  const entries: PluginEntry[] = parsePluginsSetting(readSetting("plugins"))
    .map((entry) => pluginEntryParts(entry))
    .filter((entry) => !disabled.has(entry.specifier));
  const localDir = defaultLocalPluginsDir();

  return loadPlugins({
    entries,
    ...(localDir ? { localDir } : {}),
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
