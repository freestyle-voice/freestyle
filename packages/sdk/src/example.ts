import { OutputMode } from "./output.js";
import type { Plugin } from "./plugin.js";
import { transform } from "./transform.js";

/**
 * A minimal reference plugin demonstrating the common hooks and metadata.
 * Copy this into your plugins directory and edit to taste.
 */
export default function examplePlugin(): Plugin {
  return {
    name: "freestyle-plugin-example",
    enforce: "pre",

    // Runs once per host; `mode` tells you which process you're in.
    setup({ logger, mode }) {
      logger.info(`example plugin loaded on ${mode}`);
    },

    // Observe pipeline events (read-only).
    event: ({ event }) => {
      if (event.type === "transcribed") {
        // analytics, notification, etc.
      }
    },

    // Rewrite the final cleaned text. `transform` wraps a pure function.
    afterCleanup: transform((text) =>
      text.replace(/\bteh\b/g, "the").replace(/\s+$/, ""),
    ),

    // Adjust delivery in the Electron main process; self-filter on appContext.
    beforeOutput: (input, output) => {
      output.text = output.text.trimEnd();
      if (/terminal|iterm|wezterm/i.test(input.appContext?.appName ?? "")) {
        output.mode = OutputMode.Copy;
      }
    },
  };
}
