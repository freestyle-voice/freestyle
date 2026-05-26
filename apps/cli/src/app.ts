import { buildApplication as stricliBuildApplication } from "@stricli/core";
import { dictRoute } from "./commands/dict/index.js";
import { formatRoute } from "./commands/format/index.js";
import { historyRoute } from "./commands/history/index.js";
import { serveCommand } from "./commands/serve.js";
import { versionCommand } from "./commands/version.js";
import { VERSION } from "./lib/constants.js";
import { buildRouteMap } from "./lib/route-map.js";

const routes = buildRouteMap({
  routes: {
    version: versionCommand,
    serve: serveCommand,
    format: formatRoute,
    formats: formatRoute,
    history: historyRoute,
    dict: dictRoute,
  },
  docs: {
    brief: "Freestyle CLI - voice dictation from the command line",
  },
});

export function buildApplication() {
  return stricliBuildApplication(routes, {
    name: "freestyle",
    versionInfo: {
      currentVersion: VERSION,
    },
  });
}
