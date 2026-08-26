type MessagePart = { type?: unknown };

export function toolActivityParts<T extends MessagePart>(
  parts: readonly T[],
): T[] {
  return parts.filter(
    (part) =>
      typeof part.type === "string" &&
      part.type.startsWith("tool-") &&
      part.type !== "tool-suggest_connections",
  );
}

export function agentWorkDuration(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const { agentTurnStartedAt, agentTurnCompletedAt } = metadata as {
    agentTurnStartedAt?: unknown;
    agentTurnCompletedAt?: unknown;
  };
  if (
    typeof agentTurnStartedAt !== "number" ||
    typeof agentTurnCompletedAt !== "number" ||
    !Number.isFinite(agentTurnStartedAt) ||
    !Number.isFinite(agentTurnCompletedAt)
  )
    return null;
  return Math.max(0, agentTurnCompletedAt - agentTurnStartedAt);
}
