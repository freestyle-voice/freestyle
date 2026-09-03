import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { executeMcpToolCall } = vi.hoisted(() => ({
  executeMcpToolCall: vi.fn(),
}));
vi.mock("@renderer/lib/mcp", () => ({ executeMcpToolCall }));

import { executeRemixTool } from "./remix-tool-executor";

describe("canonical Remix tool executor", () => {
  const remixGetContext = vi.fn();

  beforeEach(() => {
    executeMcpToolCall.mockReset();
    remixGetContext.mockReset();
    vi.stubGlobal("window", { api: { remixGetContext } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("dispatches MCP tools locally, never through Cloud", async () => {
    executeMcpToolCall.mockResolvedValue({ ok: true, content: [] });

    await expect(
      executeRemixTool({
        toolName: "mcp_1_search",
        toolCallId: "call-1",
        input: { query: "roadmap" },
      }),
    ).resolves.toEqual({ ok: true, content: [] });

    expect(executeMcpToolCall).toHaveBeenCalledWith("mcp_1_search", {
      query: "roadmap",
    });
  });

  it("returns a live cursor capture to the active renderer surface", async () => {
    remixGetContext.mockResolvedValue({
      ok: true,
      selection: "Draft",
      appName: "Notes",
      windowTitle: "Inbox",
      url: null,
      clipboardPreview: "Copied",
      clipboardLength: 6,
    });
    const onContext = vi.fn();

    await expect(
      executeRemixTool(
        { toolName: "get_context", toolCallId: "call-1", input: {} },
        { onContext },
      ),
    ).resolves.toMatchObject({ ok: true, selection: "Draft" });

    expect(onContext).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Draft",
        appName: "Notes",
        clipboard: "Copied",
      }),
    );
  });
});
