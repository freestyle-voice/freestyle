import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentDir = dirname(fileURLToPath(import.meta.url));
const railPath = resolve(componentDir, "remix-context-rail.tsx");
const panelPath = resolve(componentDir, "panel.tsx");
const settingsPath = resolve(componentDir, "../pages/settings.tsx");
const stylesPath = resolve(componentDir, "../remix-workspace.css");

describe("Remix context rail", () => {
  it("keeps the three context launchers compact beside the chat workspace", async () => {
    const [rail, panel, styles] = await Promise.all([
      readFile(railPath, "utf8"),
      readFile(panelPath, "utf8"),
      readFile(stylesPath, "utf8"),
    ]);

    expect(rail).toContain('"remix.contextRail"');
    expect(rail).toContain("onOpenInspector?: (target: RemixInspectorTarget)");
    expect(rail).toContain("onOpenInspector={onOpenInspector}");
    expect(rail).toContain('onOpenInspector({ kind: "tasks" })');
    expect(rail).toContain('onOpenInspector({ kind: "notes" })');
    expect(rail).toContain('kind: "file"');
    expect(rail).toContain("View all");
    expect(rail).not.toContain("remix-context-preview");
    expect(rail).not.toContain("Loading note preview");
    expect(rail).not.toContain("Loading Brain preview");
    expect(rail).not.toContain('            "Loading…"');
    expect(rail).toContain("data-context-kind={kind}");
    expect(rail).toContain("aria-hidden={!open}");
    expect(rail).toContain("inert={!open}");
    expect(panel).toContain("const contextRailVisible =");
    expect(panel).toContain(
      "narrowRemix ? narrowContextOpen : contextRailOpen",
    );
    expect(panel).toContain('contextRailVisible ? " is-context-open" : ""');
    expect(panel).toContain("open={contextRailVisible}");
    expect(panel).toContain("const openInspector =");
    expect(panel).toContain("const closeInspector =");
    expect(panel).toContain("onOpenInspector={openInspector}");
    expect(panel).toContain("onClick={closeInspector}");
    expect(panel).toContain("<RemixInspector");
    expect(panel).toContain(
      'const chatActive = desktop ? desktopSurface === "chat" : tab === "chat"',
    );
    expect(panel).toContain('desktopSurface === "chat"');
    expect(panel).not.toContain('tab === "todos"');
    expect(panel).not.toContain('tab === "notes"');
    expect(panel).not.toContain('tab === "brain"');
    expect(panel).not.toContain('tab === "apps"');
    expect(styles).toContain(".remix-context-rail");
    expect(styles).not.toContain("flex: 0 0 0;");
    expect(styles).not.toContain("flex-basis: var(--remix-context-width);");
    expect(styles).toContain("transform: translateX(20px);");
    expect(panel).toContain('className="remix-chat-header"');
    expect(panel).toContain("Session actions for $" + "{title}");
    expect(panel).toContain('<Trash2 aria-hidden="true" />');
    expect(panel).toContain(
      "thread.messages.length > 0 && onRename && onDelete",
    );
    expect(panel.indexOf("<RemixChatHeader")).toBeLessThan(
      panel.indexOf("className={`tavern-workspace${"),
    );
    expect(styles).toContain("flex: 0 0 54px;");
    expect(styles).toContain("padding: 12px 12px 14px;");
    expect(styles).not.toContain("--remix-chat-header-height");
    expect(styles).toContain(".remix-context-card-icon");
    const railStyles = styles.slice(
      styles.indexOf(".remix-context-rail"),
      styles.indexOf(".remix-context-card {"),
    );
    expect(railStyles).not.toContain("border-left");
    expect(railStyles).not.toContain("background:");
    expect(styles).toContain("@media (max-width: 1080px)");
    expect(styles).toContain("inset: 0 0 0 auto;");
    expect(railStyles).toContain("position: absolute;");
  });

  it("places the app directory under Settings rather than the desktop Remix rail", async () => {
    const [panel, settings] = await Promise.all([
      readFile(panelPath, "utf8"),
      readFile(settingsPath, "utf8"),
    ]);

    expect(settings).toContain('"connectedApps"');
    expect(settings).toContain("<ConnectedApps />");
    expect(panel).toContain("Manage connected apps from Settings.");
  });
});
