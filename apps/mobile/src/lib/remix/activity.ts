import type { RemixThreadSummary } from "./types";

export type AgentActivity = {
  id: string;
  title: string;
  updatedAt: number;
  kind: "conversation" | "brief";
};

export function mergeActivity(
  conversations: RemixThreadSummary[],
  briefs: RemixThreadSummary[],
): AgentActivity[] {
  return [...conversations, ...briefs]
    .map(({ id, title, updatedAt, origin }) => ({
      id,
      title,
      updatedAt,
      kind:
        origin === "scheduled" ? ("brief" as const) : ("conversation" as const),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
