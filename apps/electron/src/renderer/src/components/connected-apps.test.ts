import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConnectorCatalogItem } from "@renderer/lib/connectors";
import { describe, expect, it } from "vitest";
import { connectorMatchesSearch } from "./connected-apps";

const componentPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "connected-apps.tsx",
);
const remixStylesPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../remix-workspace.css",
);

const gmail: ConnectorCatalogItem = {
  slug: "gmail",
  name: "Gmail",
  description: "Search and send email.",
  categories: ["mail", "productivity"],
  connection: null,
};

describe("ConnectedApps directory", () => {
  it("finds apps by name, description, or category without waiting for the catalog", () => {
    expect(connectorMatchesSearch(gmail, "gmail")).toBe(true);
    expect(connectorMatchesSearch(gmail, "send email")).toBe(true);
    expect(connectorMatchesSearch(gmail, "productivity")).toBe(true);
    expect(connectorMatchesSearch(gmail, "calendar")).toBe(false);
  });

  it("presents the app directory as a responsive three-column card library", async () => {
    const [component, styles] = await Promise.all([
      readFile(componentPath, "utf8"),
      readFile(remixStylesPath, "utf8"),
    ]);

    expect(component).toContain(
      "connectorSearchInfiniteQueryOptions(searchTerm)",
    );
    expect(component).not.toContain("connectorSuggestedQueryOptions");
    expect(component).not.toContain("className={`connector-action${connected");
    expect(component).not.toContain("ConnectorDetail");
    expect(component).not.toContain("connectorDetailsQueryOptions");
    expect(component).toContain('className="connector-credentials-dialog"');
    expect(component).toContain('className="connector-card-open">');
    expect(component).toContain(
      "onDisconnect={() => disconnect(connector.slug)}",
    );
    expect(styles).toContain("width: min(100%, 1040px)");
    expect(styles).toContain(
      "grid-template-columns: repeat(3, minmax(0, 1fr));",
    );
    expect(styles).toContain(
      ".settings-connected-apps .connector-group {\n  grid-template-columns: repeat(2, minmax(0, 1fr));",
    );
    expect(styles).toContain("min-height: 0;");
    expect(styles).toContain("-webkit-line-clamp: 2;");
  });
});
