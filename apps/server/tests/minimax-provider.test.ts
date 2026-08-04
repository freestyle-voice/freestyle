import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { chat, createAnthropic } = vi.hoisted(() => {
  const chat = vi.fn(() => ({}));
  const createAnthropic = vi.fn(() => ({ chat }));
  return { chat, createAnthropic };
});

vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic }));

import { getLlmProvider } from "../src/lib/llm/registry.js";
import { validateApiKey } from "../src/lib/validate-key.js";

describe("MiniMax LLM providers", () => {
  beforeEach(() => {
    chat.mockClear();
    createAnthropic.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["minimax", "https://api.minimax.io/anthropic"],
    ["minimax-cn", "https://api.minimaxi.com/anthropic"],
  ])("uses the %s regional endpoint", async (providerId, baseURL) => {
    const provider = getLlmProvider(providerId);
    expect(provider).not.toBeNull();

    await provider!.createModel("MiniMax-M3", "test-key");

    expect(createAnthropic).toHaveBeenCalledWith({
      authToken: "test-key",
      baseURL,
    });
    expect(chat).toHaveBeenCalledWith("MiniMax-M3");
  });

  it.each([
    ["minimax", "https://api.minimax.io/anthropic/v1/models"],
    ["minimax-cn", "https://api.minimaxi.com/anthropic/v1/models"],
  ])("validates %s keys against its regional endpoint", async (providerId, url) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(validateApiKey(providerId, "test-key")).resolves.toEqual({
      valid: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(url, {
      headers: {
        "x-api-key": "test-key",
        "anthropic-version": "2023-06-01",
      },
      signal: expect.any(AbortSignal),
    });
  });
});
