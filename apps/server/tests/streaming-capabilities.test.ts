import { describe, expect, it } from "vitest";
import {
  supportsSessionTransport,
  supportsStreaming,
} from "../src/lib/streaming/registry.js";

describe("streaming capabilities", () => {
  it("marks MLX as batch-only session transport", () => {
    expect(supportsStreaming("local-mlx", "local-mlx/qwen3-0.6b-8bit")).toBe(
      false,
    );
    expect(
      supportsSessionTransport("local-mlx", "local-mlx/qwen3-0.6b-8bit"),
    ).toBe(true);
  });

  it("keeps live websocket providers marked as streaming", () => {
    expect(supportsStreaming("deepgram", "deepgram/nova-3")).toBe(true);
    expect(supportsSessionTransport("deepgram", "deepgram/nova-3")).toBe(true);
  });

  it("leaves pure batch providers out of websocket transport", () => {
    expect(supportsStreaming("groq", "groq/whisper-large-v3-turbo")).toBe(
      false,
    );
    expect(
      supportsSessionTransport("groq", "groq/whisper-large-v3-turbo"),
    ).toBe(false);
  });
});
