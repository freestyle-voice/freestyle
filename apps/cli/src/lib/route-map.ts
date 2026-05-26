import {
  type Command,
  type CommandContext,
  type RouteMap,
  buildRouteMap as stricliBuildRouteMap,
} from "@stricli/core";

type RoutingTarget = Command<CommandContext> | RouteMap<CommandContext>;

const ALIASES: Record<string, string[]> = {
  list: ["ls"],
  view: ["show"],
  create: ["new"],
  delete: ["rm", "remove"],
};

/**
 * Wrapper around Stricli's buildRouteMap that auto-injects standard aliases
 * (list->ls, view->show, create->new, delete->rm/remove) and hides them
 * from help output.
 */
export function buildRouteMap(config: {
  routes: Record<string, RoutingTarget>;
  docs: { brief: string };
  defaultCommand?: string;
}) {
  const routeNames = Object.keys(config.routes);
  const aliasMap: Record<string, string> = {};

  for (const name of routeNames) {
    const aliasList = ALIASES[name];
    if (aliasList) {
      for (const alias of aliasList) {
        aliasMap[alias] = name;
      }
    }
  }

  const hideRoute: Record<string, boolean> = {};
  for (const alias of Object.keys(aliasMap)) {
    hideRoute[alias] = true;
  }

  return stricliBuildRouteMap({
    routes: config.routes as any,
    docs: {
      ...config.docs,
      hideRoute,
    },
    defaultCommand: config.defaultCommand as any,
    aliases: Object.keys(aliasMap).length > 0 ? (aliasMap as any) : undefined,
  });
}
