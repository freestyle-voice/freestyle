export {
  FreestyleEventType,
  OutputMode,
  PipelineStage,
  parseAppContext,
} from "freestyle-voice";
export { relayEvent } from "./events.js";
export type { ServerTarget } from "./loader.js";
export {
  checkForUpdates,
  fetchCatalog,
  fetchPluginSettings,
  installPlugin,
  setPluginEnabled,
  uninstallPlugin,
} from "./loader.js";

// This process no longer hosts a plugin hook registry — every pipeline hook
// (`afterTranscribe`, `beforeCleanup`, `afterCleanup`, `beforeOutput`) runs
// server-side now, including `beforeOutput` (via `POST /api/output/deliver`),
// so a plugin's behavior no longer depends on which process it happens to
// load in. This module keeps only the plugin-management helpers the Plugins
// hub UI needs (install/uninstall/enable/catalog/updates) and the event relay
// that forwards app-originated events (`recordingStarted`, `outputDelivered`,
// …) into the server's single `event` hook sink.
