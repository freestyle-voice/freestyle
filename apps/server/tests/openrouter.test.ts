import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index.js";
import { validateApiKey } from "../src/lib/validate-key.js";

describe("OpenRouter support", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("validates OpenRouter keys against the current key endpoint", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { limit_remaining: 42 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await validateApiKey("openrouter", "sk-or-test-key");

    expect(result).toEqual({ valid: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/key",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-or-test-key",
        }),
      }),
    );
  });

  it("includes OpenRouter transcription models in the available catalog", async () => {
    const fetchSpy = vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://models.dev/api.json") {
        return Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      if (
        url ===
        "https://openrouter.ai/api/v1/models?output_modalities=transcription"
      ) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: "nvidia/parakeet-tdt-0.6b-v3",
                  name: "NVIDIA: Parakeet TDT 0.6B v3",
                  architecture: {
                    input_modalities: ["audio"],
                    output_modalities: ["transcription"],
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const res = await app.request("/api/models/available");

    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<Record<string, unknown>>;
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider_id: "openrouter",
          provider_name: "OpenRouter",
          model_id: "openrouter/nvidia/parakeet-tdt-0.6b-v3",
          model_name: "NVIDIA: Parakeet TDT 0.6B v3",
          type: "voice",
        }),
      ]),
    );
  });
});
