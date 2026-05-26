import { buildRouteMap } from "../../lib/route-map.js";
import { historyListCommand } from "./list.js";

export const historyRoute = buildRouteMap({
  routes: {
    list: historyListCommand,
  },
  docs: { brief: "View transcription history" },
  defaultCommand: "list",
});
