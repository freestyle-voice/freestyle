import type { Plugin } from "./plugin.js";
import { transform } from "./transform.js";

/**
 * A minimal reference plugin demonstrating the three most common hooks.
 * Copy this into your plugins directory and edit to taste.
 */
export const ExamplePlugin: Plugin = async ({ logger }) => {
  logger.info("example plugin loaded");

  return {
    // Observe pipeline events (read-only).
    event: async ({ event }) => {
      if (event.type === "server.transcribed") {
        logger.debug("transcribed", { length: event.text.length });
      }
    },

    // Rewrite the final cleaned text. `transform` wraps a pure function.
    "text.transform": transform((text) =>
      text.replace(/\bteh\b/g, "the").replace(/\s+$/, ""),
    ),

    // Adjust delivery in the Electron main process.
    "output.before": async (_input, output) => {
      output.text = output.text.trimEnd();
    },
  };
};
