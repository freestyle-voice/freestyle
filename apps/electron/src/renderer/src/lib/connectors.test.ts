import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@renderer/lib/api", () => ({ apiFetch }));

import {
  connectorToolActionName,
  isConnectorToolName,
  isReadOnlyConnectorToolName,
  listConnectorCatalog,
} from "./connectors";

describe("connected-app tool approvals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires confirmation before a connector action can execute", async () => {
    expect(
      isConnectorToolName("connector__connection_1__GMAIL_SEND_EMAIL"),
    ).toBe(true);
  });

  it("does not mistake malformed tool names for connector actions", async () => {
    expect(isConnectorToolName("connector__broken")).toBe(false);
  });

  it("identifies only server-marked read-only connector tools", () => {
    expect(
      isReadOnlyConnectorToolName(
        "connector__gmail__ro_474d41494c5f46455443485f454d41494c53",
      ),
    ).toBe(true);
    expect(
      isReadOnlyConnectorToolName("connector__gmail__474d41494c5f53454"),
    ).toBe(false);
  });

  it("keeps the approval copy readable for collision-safe tool names", () => {
    expect(
      connectorToolActionName("connector__connection_1__474d41494c5f534554"),
    ).toBe("GMAIL_SET");
    expect(
      connectorToolActionName(
        "connector__gmail__ro_474d41494c5f46455443485f454d41494c53",
      ),
    ).toBe("GMAIL_FETCH_EMAILS");
  });

  it("requests a bounded connector catalog page using the opaque cursor", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ connectors: [], nextCursor: "cursor-2" })),
    );

    await expect(
      listConnectorCatalog({ cursor: "cursor-1", limit: 24 }),
    ).resolves.toEqual({
      connectors: [],
      nextCursor: "cursor-2",
    });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/connectors/catalog?limit=24&cursor=cursor-1",
    );
  });

  it("passes a search query through to the catalog endpoint", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ connectors: [], nextCursor: null })),
    );

    await listConnectorCatalog({ search: "calendar", limit: 50 });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/connectors/catalog?limit=50&search=calendar",
    );
  });
});
