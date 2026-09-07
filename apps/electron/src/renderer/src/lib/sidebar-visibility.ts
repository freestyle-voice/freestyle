export const SIDEBAR_VISIBILITY_STORAGE_KEY = "shell.sidebarVisibility";

export type SidebarVisibility = "visible" | "hidden";

export function isSidebarVisibility(value: string): value is SidebarVisibility {
  return value === "visible" || value === "hidden";
}

export function nextSidebarVisibility(
  visibility: SidebarVisibility,
): SidebarVisibility {
  return visibility === "visible" ? "hidden" : "visible";
}
