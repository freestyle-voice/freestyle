import {
  parsePluginsSetting,
  pluginEntryParts,
} from "@freestyle-voice/validations";
import { defaultLocalPluginsDir } from "freestyle-voice";
import { readSetting, writeSetting } from "../db.js";
import { reloadServerPlugins } from "./index.js";
import {
  type InstalledPackage,
  installPackage,
  resolvePackage,
  uninstallPackage,
} from "./installer.js";

/**
 * High-level install/uninstall for the server: resolves the package from npm,
 * materializes it into the server's local plugins dir, keeps the `plugins`
 * setting in sync (the list of installed specifiers), and reloads the registry
 * so the change takes effect immediately.
 */

/** The plugins dir owned by this server, or `null` for a remote-DB config. */
function serverPluginsDir(): string | null {
  return defaultLocalPluginsDir();
}

/** Install a plugin by npm name into the server's plugins dir. */
export async function installServerPlugin(
  npmName: string,
  version?: string,
): Promise<InstalledPackage> {
  const dir = serverPluginsDir();
  if (!dir) {
    throw new Error("this server has no local plugins directory");
  }
  const resolved = await resolvePackage(npmName, version);
  const installed = await installPackage(dir, resolved);
  addSpecifier(installed.name);
  await reloadServerPlugins();
  return installed;
}

/** Remove a plugin (by package name) from the server's plugins dir + setting. */
export async function uninstallServerPlugin(specifier: string): Promise<void> {
  const dir = serverPluginsDir();
  removeSpecifier(specifier);
  if (dir) await uninstallPackage(dir, specifier);
  await reloadServerPlugins();
}

/** Add a specifier to the `plugins` setting (idempotent). */
function addSpecifier(specifier: string): void {
  const current = parsePluginsSetting(readSetting("plugins"));
  const exists = current.some(
    (e) => pluginEntryParts(e).specifier === specifier,
  );
  if (exists) return;
  writeSetting("plugins", JSON.stringify([...current, specifier]));
}

/** Remove a specifier from the `plugins` setting. */
function removeSpecifier(specifier: string): void {
  const current = parsePluginsSetting(readSetting("plugins"));
  const next = current.filter(
    (e) => pluginEntryParts(e).specifier !== specifier,
  );
  writeSetting("plugins", JSON.stringify(next));
}
