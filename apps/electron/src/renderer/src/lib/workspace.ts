export type Workspace = "remix" | "dictate";

export const WORKSPACE_STORAGE_KEY = "shell.workspace";
export const DEFAULT_WORKSPACE: Workspace = "dictate";

export function isWorkspace(value: string): value is Workspace {
  return value === "remix" || value === "dictate";
}

export function workspaceHomeRoute(workspace: Workspace): "/remix" | "/today" {
  return workspace === "remix" ? "/remix" : "/today";
}
