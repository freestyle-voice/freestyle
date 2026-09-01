import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentDir = dirname(fileURLToPath(import.meta.url));

describe("McpConnections", () => {
  it("uses a connection-shaped skeleton for its initial fetch", async () => {
    const source = await readFile(
      resolve(componentDir, "mcp-connections.tsx"),
      "utf8",
    );

    expect(source).toContain("McpConnectionsSkeleton");
    expect(source).toContain('aria-label="Loading MCP connections"');
    expect(source).not.toContain("Loading connections…");
  });
});
