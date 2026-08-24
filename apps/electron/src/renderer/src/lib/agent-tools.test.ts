import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/sprite-events", () => ({
  parseSpriteEmotion: vi.fn(),
}));

import {
  agentToolResultTelemetry,
  agentToolTier,
  executeAgentTool,
  requestAgentFileSaveGrant,
} from "./agent-tools";

describe("agent tool approval tiers", () => {
  const call = (toolName: string) => ({
    toolName,
    toolCallId: "call-1",
    input: {},
  });

  it("asks before every local shell or file tool", async () => {
    await expect(agentToolTier(call("Read"))).resolves.toBe("confirmed");
    await expect(agentToolTier(call("Glob"))).resolves.toBe("confirmed");
    await expect(agentToolTier(call("Grep"))).resolves.toBe("confirmed");
    await expect(agentToolTier(call("Write"))).resolves.toBe("confirmed");
    await expect(agentToolTier(call("Edit"))).resolves.toBe("confirmed");
    await expect(
      agentToolTier({ ...call("Bash"), input: { command: "pwd" } }),
    ).resolves.toBe("confirmed");
    await expect(agentToolTier(call("save_file"))).resolves.toBe("confirmed");
  });

  it("keeps cosmetic client tools free and leaves Cloud-owned Brain tools unclaimed", async () => {
    await expect(agentToolTier(call("current_time"))).resolves.toBe("free");
    await expect(agentToolTier(call("emote"))).resolves.toBe("free");
    await expect(agentToolTier(call("brain_read"))).resolves.toBeNull();
  });

  it("does not claim connected-app tools, which run on the server", async () => {
    await expect(
      agentToolTier(call("connector__gmail__474d41494c5f53454")),
    ).resolves.toBeNull();
  });
});

describe("safe Downloads saves", () => {
  const saveAgentFile = vi.fn();
  const requestSaveGrant = vi.fn();

  beforeEach(() => {
    saveAgentFile.mockReset();
    requestSaveGrant.mockReset();
    vi.stubGlobal("window", {
      api: { saveAgentFile, requestAgentFileSaveGrant: requestSaveGrant },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("passes a main-issued grant bound to the tool call to the Downloads IPC", async () => {
    saveAgentFile.mockResolvedValue({
      ok: true,
      path: "/safe/downloads/plan.md",
    });

    await expect(
      executeAgentTool(
        {
          toolName: "save_file",
          toolCallId: "call-1",
          input: { filename: "plan.md", content: "# Plan" },
        },
        { saveFileGrant: "main-grant" },
      ),
    ).resolves.toEqual({ ok: true, path: "/safe/downloads/plan.md" });

    expect(saveAgentFile).toHaveBeenCalledWith({
      toolCallId: "call-1",
      filename: "plan.md",
      content: "# Plan",
      grant: "main-grant",
    });
  });

  it("asks main to grant the exact approved file operation", async () => {
    requestSaveGrant.mockResolvedValue({
      ok: true,
      grant: "main-grant",
    });

    await expect(
      requestAgentFileSaveGrant({
        toolName: "save_file",
        toolCallId: "call-1",
        input: { filename: "plan.md", content: "# Plan" },
      }),
    ).resolves.toEqual({ ok: true, grant: "main-grant" });

    expect(requestSaveGrant).toHaveBeenCalledWith({
      toolCallId: "call-1",
      filename: "plan.md",
      content: "# Plan",
    });
  });
});

describe("agent tool telemetry", () => {
  it("contains only stable result metadata and never local tool payloads", () => {
    expect(
      agentToolResultTelemetry({
        tool: "save_file",
        platform: "win32",
        appVersion: "0.8.8",
        durationMs: 12.4,
        output: {
          ok: false,
          reason: "permission-denied",
          stdout: "secret command output",
          path: "C:\\Users\\Freestyle\\Downloads\\plan.md",
          content: "private generated document",
          exitCode: 5,
        },
      }),
    ).toEqual({
      tool: "save_file",
      platform: "win32",
      appVersion: "0.8.8",
      durationMs: 12,
      ok: false,
      result: "permission-denied",
      exitCode: 5,
    });
  });
});
