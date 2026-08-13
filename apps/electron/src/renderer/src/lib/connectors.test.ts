import { describe, expect, it } from "vitest";
import { isConnectorToolName } from "./connectors";

describe("connected-app tool approvals", () => {
  it("requires confirmation before a connector action can execute", async () => {
    expect(
      isConnectorToolName("connector__connection_1__GMAIL_SEND_EMAIL"),
    ).toBe(true);
  });

  it("does not mistake malformed tool names for connector actions", async () => {
    expect(isConnectorToolName("connector__broken")).toBe(false);
  });
});
