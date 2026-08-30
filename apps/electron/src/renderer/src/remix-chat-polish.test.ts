import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("Remix chat polish", () => {
  it("uses consistent action icons instead of text glyphs", async () => {
    const panel = await readFile(
      resolve(rendererRoot, "components/panel.tsx"),
      "utf8",
    );

    expect(panel).toContain("Copy");
    expect(panel).toContain("Pencil");
    expect(panel).toContain("RotateCcw");
    expect(panel).not.toContain('>{copied ? "✓" : "⧉"}</span>');
    expect(panel).not.toContain(">✎</span>");
    expect(panel).not.toContain(">↻</span>");
  });

  it("keeps the Remix composer to a single bordered surface", async () => {
    const styles = await readFile(
      resolve(rendererRoot, "remix-workspace.css"),
      "utf8",
    );

    expect(styles).toMatch(
      /\.remix-agent \.tavern-composer\s*\{[^}]*border:\s*1px solid var\(--border\);/s,
    );
    expect(styles).toMatch(
      /\.remix-agent \.tavern-input\s*\{[^}]*border:\s*0;/s,
    );
  });

  it("keeps the compact pill passive until the user explicitly opens Remix", async () => {
    const [chat, pill] = await Promise.all([
      readFile(resolve(rendererRoot, "components/remix-chat.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "pages/app.tsx"), "utf8"),
    ]);

    expect(chat).toContain("Open Remix workspace");
    expect(chat).not.toContain("onMouseEnter={props.onEnter}");
    expect(pill).toContain("window.api.openRemixWorkspace(threadId)");
    expect(pill).not.toContain("onPillHotEnter");
  });

  it("keeps a settled compact response open while it is being inspected", async () => {
    const chat = await readFile(
      resolve(rendererRoot, "components/remix-chat.tsx"),
      "utf8",
    );

    expect(chat).toContain("const [pointerOverChat, setPointerOverChat]");
    expect(chat).toContain("if (!minimized || !settled || pointerOverChat)");
    expect(chat).toContain("onMouseLeave={handleMouseLeave}");
  });
});
