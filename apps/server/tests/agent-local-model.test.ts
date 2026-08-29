import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/providers.js", () => ({
  getDefaultModels: () => ({
    voice: null,
    llm: {
      provider: "local-llm",
      model_id: "local-llm/qwen3",
      model_name: "Qwen 3",
    },
  }),
}));

vi.mock("../src/lib/sessions.js", () => ({
  getSessionToken: () => null,
  invalidateSession: vi.fn(),
}));

const { runLocalAgent } = vi.hoisted(() => ({
  runLocalAgent: vi.fn(
    async () =>
      new Response("", {
        headers: { "x-vercel-ai-ui-message-stream": "v1" },
      }),
  ),
}));

vi.mock("../src/lib/local-agent.js", () => ({ runLocalAgent }));

import agentRoute from "../src/routes/agent.js";

describe("agent local model routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the selected local model without requiring a Cloud session", async () => {
    const response = await agentRoute.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ id: "message-1", role: "user", parts: [] }],
        threadId: "thread-1",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(runLocalAgent).toHaveBeenCalledWith(
      [{ id: "message-1", role: "user", parts: [] }],
      { provider: "local-llm", modelId: "local-llm/qwen3" },
      expect.any(AbortSignal),
    );
  });
});
