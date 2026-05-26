import { buildRouteMap } from "../../lib/route-map.js";
import { dictCreateCommand } from "./create.js";
import { dictDeleteCommand } from "./delete.js";
import { dictListCommand } from "./list.js";
import { dictUpdateCommand } from "./update.js";
import { dictViewCommand } from "./view.js";

export const dictRoute = buildRouteMap({
  routes: {
    list: dictListCommand,
    view: dictViewCommand,
    create: dictCreateCommand,
    update: dictUpdateCommand,
    delete: dictDeleteCommand,
  },
  docs: { brief: "Manage the word dictionary" },
  defaultCommand: "list",
});
