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
    apply: "server",

    setup({ logger }) {
      logger.info("example plugin loaded");
    },

    // Observe pipeline events (read-only).
    event: ({ event }) => {
      if (event.type === "server.transcribed") {
        // analytics, notification, etc.
      }
    },

    // Rewrite the final cleaned text. `transform` wraps a pure function.
    "text.transform": transform((text) =>
      text.replace(/\bteh\b/g, "the").replace(/\s+$/, ""),
    ),

    // Adjust delivery in the Electron main process; self-filter on appContext.
    "output.before": (input, output) => {
      output.text = output.text.trimEnd();
      if (/terminal|iterm|wezterm/i.test(input.appContext?.appName ?? "")) {
        output.mode = OutputMode.Copy;
      }
    },
  };
}
