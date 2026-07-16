import type { CommandDraft } from "./store.js";

/**
 * Commands seeded on first run so the plugin is useful out of the box. All use
 * the cross-platform `openUrl` action (no config, no keys, no shell) and pick
 * multi-word trigger phrases that are unlikely to collide with ordinary
 * dictation. Users can edit, disable, or delete them freely — they are only
 * seeded once, when no commands have ever been saved.
 */
export const DEFAULT_COMMANDS: CommandDraft[] = [
  {
    name: "Web search",
    triggers: ["search the web for", "search the internet for"],
    description:
      "Open a web search for the spoken query. The payload is the search terms.",
    action: {
      type: "openUrl",
      url: "https://www.google.com/search?q={{input}}",
    },
    enabled: true,
  },
  {
    name: "YouTube search",
    triggers: ["search youtube for", "find on youtube"],
    description:
      "Open a YouTube search for the spoken query. The payload is the search terms.",
    action: {
      type: "openUrl",
      url: "https://www.youtube.com/results?search_query={{input}}",
    },
    enabled: true,
  },
  {
    name: "Maps directions",
    triggers: ["get directions to", "navigate to"],
    description:
      "Open Google Maps for the spoken place or address. The payload is the destination.",
    action: {
      type: "openUrl",
      url: "https://www.google.com/maps/search/{{input}}",
    },
    enabled: true,
  },
  {
    name: "Wikipedia lookup",
    triggers: ["look up on wikipedia", "search wikipedia for"],
    description:
      "Open a Wikipedia search for the spoken topic. The payload is the topic.",
    action: {
      type: "openUrl",
      url: "https://en.wikipedia.org/wiki/Special:Search?search={{input}}",
    },
    enabled: true,
  },
];
