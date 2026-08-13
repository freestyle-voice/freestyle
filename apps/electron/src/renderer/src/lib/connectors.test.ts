import { describe, expect, it } from "vitest";
import { connectorToolActionName, isConnectorToolName } from "./connectors";

describe("connected-app tool approvals", () => {
  it("requires confirmation before a connector action can execute", async () => {
    expect(
      isConnectorToolName("connector__connection_1__GMAIL_SEND_EMAIL"),
    ).toBe(true);
  });

  it("does not mistake malformed tool names for connector actions", async () => {
    expect(isConnectorToolName("connector__broken")).toBe(false);
  });

  it("keeps the approval copy readable for collision-safe tool names", () => {
    expect(
      connectorToolActionName("connector__connection_1__474d41494c5f534554"),
    ).toBe("GMAIL_SET");
  });
});
