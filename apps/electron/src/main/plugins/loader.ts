import type { HookFailure, PluginEntry } from "@freestyle/sdk";
import {
  defaultLocalPluginsDir,
  loadPlugins,
  type PluginRegistry,
} from "@freestyle/sdk";
import { createAppLogger } from "@freestyle/utils";
import { parsePluginsSetting, pluginEntryParts } from "@freestyle/validations";
import { buildPluginContext, readSetting } from "./context.js";

const log = createAppLogger("plugins");

/**
 * Load all plugins for the Electron main process via the shared SDK loader.
 * Same sources and ordering as the server host; each plugin's app-side hooks
 * (e.g. `beforeOutput`) run here while its server hooks run in the server.
 */
export async function loadAppPlugins(): Promise<PluginRegistry> {
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
}
