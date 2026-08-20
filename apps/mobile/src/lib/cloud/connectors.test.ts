import { beforeEach, describe, expect, it, vi } from "vitest";

const { json } = vi.hoisted(() => ({ json: vi.fn() }));

vi.mock("./client", () => ({ cloud: { json } }));

import {
  connectToolkit,
  connectToolkitWithCredentials,
  disconnectToolkit,
  listConnectorCatalog,
  listConnectorConnections,
} from "./connectors";

describe("mobile connected-app client", () => {
  beforeEach(() => json.mockReset());

  it("loads the catalog with a bounded page size", async () => {
    json.mockResolvedValueOnce({ connectors: [], nextCursor: null });

    await expect(listConnectorCatalog({ search: "mail" })).resolves.toEqual({
      connectors: [],
      nextCursor: null,
    });

    expect(json).toHaveBeenCalledWith(
      "/v2/connectors/catalog?limit=24&search=mail",
    );
  });

  it("keeps OAuth URLs and destructive disconnects behind specific routes", async () => {
    json
      .mockResolvedValueOnce({ connectUrl: "https://provider.test/connect" })
      .mockResolvedValueOnce({ ok: true });

    await expect(connectToolkit("gmail")).resolves.toEqual(
      "https://provider.test/connect",
    );
    await expect(disconnectToolkit("gmail")).resolves.toBeUndefined();

    expect(json).toHaveBeenNthCalledWith(1, "/v2/connectors/gmail/connect", {
      method: "POST",
    });
    expect(json).toHaveBeenNthCalledWith(2, "/v2/connectors/gmail/disconnect", {
      method: "POST",
    });
  });

  it("returns the user-owned connected accounts", async () => {
    json.mockResolvedValueOnce({ connections: [{ toolkitSlug: "gmail" }] });

    await expect(listConnectorConnections()).resolves.toEqual([
      { toolkitSlug: "gmail" },
    ]);
    expect(json).toHaveBeenCalledWith("/v2/connectors");
  });

  it("sends API-key credentials only to the selected connector", async () => {
    json.mockResolvedValueOnce({ connection: { toolkitSlug: "linear" } });

    await expect(
      connectToolkitWithCredentials("linear", { api_key: "secret" }),
    ).resolves.toEqual({ toolkitSlug: "linear" });
    expect(json).toHaveBeenCalledWith("/v2/connectors/linear/connect", {
      method: "POST",
      json: { credentials: { api_key: "secret" } },
    });
  });
});
