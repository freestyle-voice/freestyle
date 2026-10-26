import { generateText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/lib/db.js";
import { getLlmProvider } from "../src/lib/llm/registry.js";
import { createCleanupModel } from "../src/lib/providers.js";
import { isCleanupModelSupported } from "../src/routes/models.js";

afterEach(() => vi.unstubAllGlobals());

describe("explicit cleanup model choice", () => {
  it("allows a registered provider's model missing from the catalog", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        openai: {
          models: {
            "embedding-model": {
              id: "embedding-model",
              name: "Embedding",
              modalities: { input: ["text"], output: ["text"] },
            },
          },
        },
      }),
    );
    expect(
      await isCleanupModelSupported("openai", "openai/new-chat-model"),
    ).toBe(true);
    expect(
      await isCleanupModelSupported("openai", "openai/embedding-model"),
    ).toBe(false);
  });

  it("rejects unsupported providers even when the catalog is unavailable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect(await isCleanupModelSupported("unregistered", "chat-model")).toBe(
      false,
    );
    expect(getLlmProvider("openrouter-lookalike")).toBeNull();
  });

  it("sends the chosen OpenRouter vendor/model and saved key to the gateway", async () => {
    getDb()
      .prepare(
        "INSERT OR REPLACE INTO api_keys (provider, key, status) VALUES (?, ?, ?)",
      )
      .run("openrouter", "test-openrouter-key", "valid");
    let requestUrl = "";
    let requestModel = "";
    let authorization = "";
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      requestUrl = String(url);
      requestModel = JSON.parse(String(init.body)).model;
      authorization = new Headers(init.headers).get("authorization") ?? "";
      return Response.json({
        id: "completion-1",
        object: "chat.completion",
        created: 1,
        model: "vendor/new-chat-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hello." },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      });
    });
    const model = await createCleanupModel(
      "openrouter",
      "openrouter/vendor/new-chat-model",
    );
    const result = await generateText({
      model,
      prompt: "hello",
      maxRetries: 0,
    });
    expect(result.text).toBe("Hello.");
    expect(requestUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(requestModel).toBe("vendor/new-chat-model");
    expect(authorization).toBe("Bearer test-openrouter-key");
  });
});
