import { apiFetch } from "@renderer/lib/api";

export type AttentionTarget =
  | {
      type: "thread";
      threadId: string;
      turnId?: string;
      actionId?: string;
    }
  | { type: "scheduled"; taskId: string; runId: string; threadId?: string }
  | { type: "connection"; connectionId: string };

export type AttentionItem = {
  id: string;
  kind: "approval" | "agent_run" | "scheduled_run" | "connection";
  priority: "requires_action" | "important" | "informational";
  status: "waiting" | "running" | "failed";
  title: string;
  detail?: string;
  createdAt: string;
  updatedAt: string;
  target: AttentionTarget;
};

export type AttentionSnapshot = {
  generatedAt: string;
  items: AttentionItem[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseTarget(value: unknown): AttentionTarget | null {
  if (!isRecord(value) || !isText(value.type)) return null;
  if (value.type === "thread" && isText(value.threadId)) {
    return {
      type: "thread",
      threadId: value.threadId,
      ...(isText(value.turnId) ? { turnId: value.turnId } : {}),
      ...(isText(value.actionId) ? { actionId: value.actionId } : {}),
    };
  }
  if (
    value.type === "scheduled" &&
    isText(value.taskId) &&
    isText(value.runId)
  ) {
    return {
      type: "scheduled",
      taskId: value.taskId,
      runId: value.runId,
      ...(isText(value.threadId) ? { threadId: value.threadId } : {}),
    };
  }
  if (value.type === "connection" && isText(value.connectionId)) {
    return { type: "connection", connectionId: value.connectionId };
  }
  return null;
}

function parseItem(value: unknown): AttentionItem | null {
  if (!isRecord(value)) return null;
  const target = parseTarget(value.target);
  if (
    !target ||
    !isText(value.id) ||
    !isText(value.title) ||
    !isText(value.createdAt) ||
    !isText(value.updatedAt) ||
    !["approval", "agent_run", "scheduled_run", "connection"].includes(
      String(value.kind),
    ) ||
    !["requires_action", "important", "informational"].includes(
      String(value.priority),
    ) ||
    !["waiting", "running", "failed"].includes(String(value.status))
  ) {
    return null;
  }
  return {
    id: value.id,
    kind: value.kind as AttentionItem["kind"],
    priority: value.priority as AttentionItem["priority"],
    status: value.status as AttentionItem["status"],
    title: value.title,
    ...(isText(value.detail) ? { detail: value.detail } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    target,
  };
}

/** Return a safe empty state while an older Cloud deployment lacks the additive endpoint. */
export async function getAttention(): Promise<AttentionSnapshot> {
  const response = await apiFetch("/api/attention");
  if (response.status === 404)
    return { generatedAt: new Date().toISOString(), items: [] };
  if (!response.ok)
    throw new Error("Could not load work that needs attention.");
  const payload: unknown = await response.json();
  if (
    !isRecord(payload) ||
    !isText(payload.generatedAt) ||
    !Array.isArray(payload.items)
  ) {
    throw new Error("Received an invalid work snapshot.");
  }
  return {
    generatedAt: payload.generatedAt,
    items: payload.items
      .map(parseItem)
      .filter((item): item is AttentionItem => item !== null),
  };
}
