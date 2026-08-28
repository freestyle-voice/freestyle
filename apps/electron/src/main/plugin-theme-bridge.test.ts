import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const electronRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pluginBridgePath = resolve(electronRoot, "src/preload/plugin-bridge.ts");
const viteConfigPath = resolve(electronRoot, "electron.vite.config.ts");

describe("plugin theme bridge", () => {
  it("bundles the preload that applies the dashboard theme tokens to plugin views", async () => {
    const bridgeExists = await stat(pluginBridgePath)
      .then(() => true)
      .catch(() => false);

    expect(bridgeExists).toBe(true);

    const [bridge, viteConfig] = await Promise.all([
      readFile(pluginBridgePath, "utf8"),
      readFile(viteConfigPath, "utf8"),
    ]);
    expect(bridge).toContain("function applyTokens");
    expect(bridge).toContain("root.style.setProperty(key, value)");
    expect(viteConfig).toContain(
      '"plugin-bridge": resolve("src/preload/plugin-bridge.ts"),',
    );
  });
});
