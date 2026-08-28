import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "index.ts");

function sourceForFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}()`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

describe("plugin UI host initialization", () => {
  it("registers the plugin-view IPC handler for the dashboard window", async () => {
    const source = await readFile(mainPath, "utf8");
    const panelWindow = sourceForFunction(source, "createPanelWindow");

    expect(source).toContain(
      'import { initPluginUiHost, invalidatePluginViews } from "./plugins/ui-host";',
    );
    expect(panelWindow).toContain("initPluginUiHost({");
    expect(panelWindow).toContain("window: panelWindow");
    expect(panelWindow).toContain("getServerBaseUrl");
    expect(panelWindow).toContain("getServerToken");
    expect(panelWindow).toContain("onAction: handlePluginAction");
  });
});
