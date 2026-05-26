import { buildRouteMap } from "../../lib/route-map.js";
import { formatCreateCommand } from "./create.js";
import { formatDeleteCommand } from "./delete.js";
import { formatListCommand } from "./list.js";
import { formatUpdateCommand } from "./update.js";
import { formatViewCommand } from "./view.js";

export const formatRoute = buildRouteMap({
  routes: {
    list: formatListCommand,
    view: formatViewCommand,
    create: formatCreateCommand,
    update: formatUpdateCommand,
    delete: formatDeleteCommand,
  },
  docs: { brief: "Manage formatting rules" },
  defaultCommand: "list",
});
