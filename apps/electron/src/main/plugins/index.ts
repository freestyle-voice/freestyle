export {
  FreestyleEventType,
  OutputMode,
  PipelineStage,
  parseAppContext,
} from "freestyle-voice";
export { relayEvent } from "./events.js";

// This process no longer hosts a plugin hook registry or any plugin
// management: every pipeline hook (`afterTranscribe`, `beforeCleanup`,
// `afterCleanup`, `beforeOutput`) runs server-side, and discovery, install/
// uninstall, catalog, updates, and UI-asset serving all live on the server too
// (the renderer talks to it directly over the typed `hc` client). What remains
// here is only OS-level: overlaying a plugin's page in a `WebContentsView`
// (see `ui-host.ts`/`view-manager.ts`) and relaying app-originated events
// (`recordingStarted`, `outputDelivered`, …) into the server's `event` sink.
