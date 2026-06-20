/**
 * Conversation history (Voice OS) — wraps the Agent SDK's on-disk session store
 * so the bar can list past conversations and reload their transcripts. Sessions
 * are keyed by working directory, so callers pass the same cwd used for runs.
 */
import {
  getSessionMessages,
  listSessions,
} from "@anthropic-ai/claude-agent-sdk";
import { createAppLogger } from "@freestyle/utils";
import type { AgentConversation, AgentMessage } from "@freestyle/validations";

const log = createAppLogger("agent-history");

/** Best-effort plain-text extraction from a raw API message's content. */
function extractText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object") {
      const b = block as { type?: unknown; text?: unknown };
      if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
    }
  }
  return parts.join("\n");
}

export async function listConversations(
  cwd: string,
): Promise<AgentConversation[]> {
  try {
    const sessions = await listSessions({ dir: cwd, limit: 50 });
    return sessions.map((s) => ({
      id: s.sessionId,
      title: (s.customTitle || s.summary || s.firstPrompt || "Untitled")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80),
      updatedAt: s.lastModified,
    }));
  } catch (err) {
    log.warn(`listConversations failed: ${String(err)}`);
    return [];
  }
}

export async function getConversation(
  id: string,
  cwd: string,
): Promise<AgentMessage[]> {
  try {
    const messages = await getSessionMessages(id, { dir: cwd });
    const out: AgentMessage[] = [];
    for (const m of messages) {
      if (m.type !== "user" && m.type !== "assistant") continue;
      const text = extractText(m.message).trim();
      if (text) out.push({ role: m.type, text });
    }
    return out;
  } catch (err) {
    log.warn(`getConversation failed: ${String(err)}`);
    return [];
  }
}
