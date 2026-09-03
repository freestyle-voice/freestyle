import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pluginsPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "plugins.tsx",
);

function pluginCardSource(source: string): string {
  const start = source.indexOf("function PluginCard(");
  const nextComponent = source.indexOf("\nfunction BrowseTab(", start);
  return source.slice(start, nextComponent);
}

describe("installed plugin actions", () => {
  it("keeps update and uninstall controls outside the card navigation button", async () => {
    const source = await readFile(pluginsPath, "utf8");
    const card = pluginCardSource(source);

    expect(card).toContain(
      'className="min-w-0 flex flex-1 items-center gap-4 text-left outline-none',
    );
    expect(card).toContain(
      "onClick={() => navigate(`/plugins/" + "$" + "{plugin.slug}`)}",
    );
    expect(card).not.toContain("onClickCapture");
    expect(card).not.toContain(
      'className="border-border bg-card hover:bg-card/70 flex w-full cursor-pointer items-center gap-4 rounded-[14px] border p-5 text-left transition-colors"',
    );
  });
});
