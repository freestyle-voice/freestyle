import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("Remix pill agent contract", () => {
  it("uses the persistent workspace agent transport and stable thread", async () => {
    const chat = await readFile(
      resolve(rendererRoot, "../components/remix-chat.tsx"),
      "utf8",
    );

    expect(chat).toContain('api: "/api/agent"');
    expect(chat).toContain('apiFetch("/api/agent"');
    expect(chat).toContain("threadId: thread.id");
    expect(chat).toContain("onOpenWorkspace(thread.id)");
    expect(chat).toContain("executeRemixTool(call");
    expect(chat).not.toContain('"/api/remix/thread');
    expect(chat).not.toContain('"/api/remix/agent');
  });
});
