import type { HookFailure, PluginEntry } from "@freestyle/sdk";
import {
  defaultLocalPluginsDir,
  loadPlugins,
  type PluginRegistry,
} from "@freestyle/sdk";
import { createAppLogger } from "@freestyle/utils";
import { parsePluginsSetting, pluginEntryParts } from "@freestyle/validations";
import { readSetting } from "../db.js";
import { captureException } from "../posthog.js";
import { buildPluginContext } from "./context.js";

const log = createAppLogger("plugins");

/**
 * Load all plugins for the server process via the shared SDK loader, returning
 * a ready-to-use {@link PluginRegistry}. Sources, in load order: npm/module
 * specifiers from the `plugins` setting, then local files in
 * `<userData>/plugins/`.
 */
export async function loadServerPlugins(): Promise<PluginRegistry> {
  const entries: PluginEntry[] = parsePluginsSetting(
    readSetting("plugins"),
  ).map((entry) => pluginEntryParts(entry));
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
