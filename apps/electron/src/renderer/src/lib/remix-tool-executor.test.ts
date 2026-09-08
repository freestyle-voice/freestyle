import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { executeMcpToolCall } = vi.hoisted(() => ({
  executeMcpToolCall: vi.fn(),
}));
vi.mock("@renderer/lib/mcp", () => ({ executeMcpToolCall }));

import {
  executeApprovedRemixTool,
  executeRemixTool,
} from "./remix-tool-executor";

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
  it("allows a confirmed cursor replacement through the cursor executor", async () => {
    const remixPasteClipboard = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("window", { api: { remixPasteClipboard } });
    expect(
      await executeApprovedRemixTool({
        toolName: "paste",
        toolCallId: "replacement",
        input: {},
      }),
    ).toEqual({ ok: true });
    expect(remixPasteClipboard).toHaveBeenCalledTimes(1);
  });
  it("allows a confirmed MCP replacement through its local MCP executor", async () => {
    executeMcpToolCall.mockResolvedValue({ ok: true, content: [] });
    expect(
      await executeApprovedRemixTool({
        toolName: "mcp_1_search",
        toolCallId: "replacement",
        input: { query: "roadmap" },
      }),
    ).toEqual({ ok: true, content: [] });
    expect(executeMcpToolCall).toHaveBeenCalledWith("mcp_1_search", {
      query: "roadmap",
    });
  });
  it("preserves a declined save-file grant without executing the approved action", async () => {
    const requestAgentFileSaveGrant = vi.fn(async () => ({
      ok: false,
      reason: "canceled",
    }));
    vi.stubGlobal("window", { api: { requestAgentFileSaveGrant } });
    expect(
      await executeApprovedRemixTool({
        toolName: "save_file",
        toolCallId: "replacement",
        input: { filename: "test.txt", content: "content" },
      }),
    ).toEqual({ ok: false, reason: "canceled" });
    expect(requestAgentFileSaveGrant).toHaveBeenCalledWith({
      toolCallId: "replacement",
      filename: "test.txt",
      content: "content",
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
      executeApprovedRemixTool(
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
