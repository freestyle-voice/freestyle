import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index.js";

describe("OpenAPI-compatible local LLM setup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("allows manual model entry when /models discovery is unavailable", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("not found", {
        status: 404,
        statusText: "Not Found",
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const res = await app.request("/api/settings/local-llm/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://demo.openai.azure.com/openai/v1",
        api_key: "azure-key",
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        models: [],
        model_discovery: "manual",
        hint: expect.stringContaining("deployment"),
      }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://demo.openai.azure.com/openai/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer azure-key",
          "api-key": "azure-key",
        }),
      }),
    );
  });
});
