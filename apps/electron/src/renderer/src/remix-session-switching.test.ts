import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("Remix session switching", () => {
  it("selects the session chrome before its messages finish loading", async () => {
    const [sessions, history] = await Promise.all([
      readFile(
        resolve(rendererRoot, "components/remix-session-context.tsx"),
        "utf8",
      ),
      readFile(resolve(rendererRoot, "components/thread-history.tsx"), "utf8"),
    ]);

    expect(sessions).toContain("selectThread");
    expect(sessions).toContain("setLoadingThreadId(summary.id)");
    expect(sessions).toContain("title: summary.title");
    expect(sessions).toContain("if (cached) return;");
    expect(history).not.toContain("fetchQuery(threadQueryOptions(thread.id))");
  });

  it("keeps the selected title visible while the chat body loads", async () => {
    const [panel, styles] = await Promise.all([
      readFile(resolve(rendererRoot, "components/panel.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "remix-workspace.css"), "utf8"),
    ]);

    expect(panel).toContain("isSessionLoading");
    expect(panel).toContain('className="remix-conversation-skeleton"');
    expect(panel).toContain("Loading conversation");
    expect(styles).toContain(".remix-agent .remix-conversation-skeleton");
  });

  it("refreshes an open pill session without navigating away from a newer selection", async () => {
    const sessions = await readFile(
      resolve(rendererRoot, "components/remix-session-context.tsx"),
      "utf8",
    );

    expect(sessions).toContain("onPanelThreadUpdated");
    expect(sessions).toContain("fetchQuery(threadQueryOptions(threadId))");
    expect(sessions).toContain("current?.id === threadId ? loaded : current");
  });

  it("returns from schedules to chat when the pill opens a session", async () => {
    const sessions = await readFile(
      resolve(rendererRoot, "components/remix-session-context.tsx"),
      "utf8",
    );
    const panelOpen = sessions.slice(
      sessions.indexOf("onPanelOpenThread"),
      sessions.indexOf("onPanelThreadUpdated"),
    );

    expect(panelOpen).toContain("openChat();");
  });
});
