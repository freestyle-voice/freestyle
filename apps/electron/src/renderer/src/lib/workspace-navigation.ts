/** The panel only has room for a persistent rail above this width. */
export const WORKSPACE_RAIL_MIN_WIDTH = 640;

export type WorkspaceNavigationMode = "rail" | "drawer";

export function workspaceNavigationMode(
  width: number,
): WorkspaceNavigationMode {
  return width >= WORKSPACE_RAIL_MIN_WIDTH ? "rail" : "drawer";
}

export interface ActivitySummaryItem {
  title: string;
  phase: "done" | "running" | "failed" | "declined";
}

/**
 * Keeps a busy agent legible in the transcript: the compact row communicates
 * progress, while its expanded contents retain each request/result.
 */
export function compactActivitySummary(
  items: ActivitySummaryItem[],
  elapsedMs?: number | null,
): {
  label: string;
  running: boolean;
} {
  const running = items.some((item) => item.phase === "running");
  if (!running && typeof elapsedMs === "number") {
    const seconds = Math.floor(elapsedMs / 1_000);
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return {
      label: `Worked for ${minutes > 0 ? `${minutes}m ` : ""}${remainder}s`,
      running,
    };
  }
  if (items.length === 1)
    return { label: items[0]?.title ?? "Activity", running };
  if (running) return { label: `${items.length} actions`, running };

  const grouped = new Map<string, number>();
  for (const item of items) {
    // Tool presentation may add context after a middle dot; the action itself
    // is what helps someone scan a completed run at a glance.
    const label = item.title.split(" · ")[0]?.trim() || "Completed action";
    grouped.set(label, (grouped.get(label) ?? 0) + 1);
  }
  const highlights = [...grouped.entries()]
    .sort(([, left], [, right]) => right - left)
    .slice(0, 2)
    .map(([label, count]) => (count > 1 ? `${label} ×${count}` : label));

  return {
    label: `${items.length} actions${highlights.length ? ` · ${highlights.join(" · ")}` : ""}`,
    running,
  };
}
