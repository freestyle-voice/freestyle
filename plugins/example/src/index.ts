import type { Plugin, PluginLogger } from "freestyle-voice";

/**
 * A minimal example Freestyle plugin. Copy this folder to bootstrap your own.
 *
 * It shows the two most common starting points:
 *   1. Contributing a UI page — declared in `package.json` under
 *      `freestyle.contributes.pages`, rendered from `ui/index.html`.
 *   2. Listening to the dictation pipeline with the read-only `event` hook.
 *
 * The rest of the API — mutating hooks (`afterTranscribe`, `afterCleanup`,
 * `beforeOutput`, …), settings, and the UI bridge — lives in the
 * `freestyle-voice` package.
 */
export default function examplePlugin(): Plugin {
  // `setup` runs once per host. Capture anything the hooks below need
  // (logger, settings) in a closure.
  let log: PluginLogger | undefined;

  return {
    name: "freestyle-plugin-example",

    setup({ logger, mode }) {
      log = logger;
      logger.info(`example plugin ready on ${mode}`);
    },

    // Observe pipeline events (recordingStarted, transcribed, cleaned,
    // outputDelivered, …). Read-only: to *change* text or output, use a
    // mutating hook such as `afterCleanup` or `beforeOutput` instead.
    event({ event }) {
      log?.info(`event: ${event.type}`);
    },
  };
}
