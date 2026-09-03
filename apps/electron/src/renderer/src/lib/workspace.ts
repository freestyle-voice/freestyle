export type Workspace = "remix" | "dictate";

export const WORKSPACE_STORAGE_KEY = "shell.workspace";
export const DEFAULT_WORKSPACE: Workspace = "dictate";

export function isWorkspace(value: string): value is Workspace {
  return value === "remix" || value === "dictate";
}

export function workspaceHomeRoute(workspace: Workspace): "/remix" | "/today" {
  return workspace === "remix" ? "/remix" : "/today";
}

/**
 * The app route is authoritative while a user is working in Dictate or Remix.
 * Settings routes intentionally return null so their dedicated sidebar can
 * return to the workspace the user last selected. Plugin pages are Dictate
 * tools, so they retain the Dictate sidebar and workspace.
 */
export function workspaceForAppPath(pathname: string): Workspace | null {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return null;
  }
  return pathname === "/remix" ? "remix" : "dictate";
}
