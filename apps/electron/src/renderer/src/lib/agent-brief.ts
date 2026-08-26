type DataPart = { type?: unknown; data?: unknown; [key: string]: unknown };

export type AgentBrief = {
  headline: string;
  summary: string | null;
  points: string[];
};

/** Validates the compact display projection while leaving all raw message
 * parts available for persistence, copy, and future detail views. */
export function readAgentBrief(parts: readonly DataPart[]): AgentBrief | null {
  const part = parts.find((candidate) => candidate.type === "data-brief");
  const data = part?.data;
  if (!data || typeof data !== "object") return null;
  const { headline, summary, points } = data as {
    headline?: unknown;
    summary?: unknown;
    points?: unknown;
  };
  if (
    typeof headline !== "string" ||
    (summary !== null &&
      summary !== undefined &&
      typeof summary !== "string") ||
    !Array.isArray(points) ||
    !points.every((point) => typeof point === "string")
  )
    return null;
  return { headline, summary: summary ?? null, points };
}
