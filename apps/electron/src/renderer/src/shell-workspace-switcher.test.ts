import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const shellPath = resolve(dirname(fileURLToPath(import.meta.url)), "shell.tsx");
const workspaceStylesPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "remix-workspace.css",
);
const shellStylesPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "shell.css",
);

describe("workspace switcher", () => {
  it("loads shared sidebar styles before a lazy Remix route resolves", async () => {
    const shell = await readFile(shellPath, "utf8");

    expect(shell).toContain('import "./shell.css"');
  });

  it("keeps the workspace switcher as a plain, prominent titlebar control", async () => {
    const shell = await readFile(shellPath, "utf8");

    expect(shell).toContain('className="remix-workspace-switcher"');
    expect(shell).toContain('className="remix-sidebar-titlebar"');
    expect(shell).toContain('aria-label="Switch workspace"');
    expect(shell).toContain("onFullscreenChanged(setIsFullscreen)");
    expect(shell).toContain('isFullscreen ? "h-0" : "h-8"');
    expect(shell).toContain("WORKSPACE_STORAGE_KEY");
    expect(shell).toContain('from "@renderer/lib/workspace"');
    expect(shell).toContain("const isSettingsRoute =");
    expect(shell).toContain(
      'const isRemixSidebar = activeWorkspace === "remix";',
    );
    expect(shell).toContain("workspace={activeWorkspace}");
    expect(shell).toContain("workspaceForAppPath(location.pathname)");
    expect(shell).not.toContain(
      'const isRemixWorkspace = location.pathname === "/remix";',
    );
    expect(shell).toContain('to: "/settings/models"');
    expect(shell).toContain("icon: Cpu");
    expect(shell).not.toContain("advancedMode");
    expect(shell).not.toContain("settingsQueryOptions");
  });

  it("keeps the workspace selector close to the native titlebar controls", async () => {
    const shell = await readFile(shellPath, "utf8");
    const styles = await readFile(shellStylesPath, "utf8");

    expect(styles).toContain("padding: 10px 20px 8px;");
    expect(styles).toContain(
      '.remix-workspace-switcher:is(:hover, [data-state="open"])',
    );
    expect(styles).toContain("background: var(--secondary);");
    expect(styles).toContain("box-shadow: inset 0 0 0 1px var(--border);");
    expect(shell).toContain('className="remix-dev-badge"');
    expect(shell).toContain('title="Development build"');
    expect(styles).toContain(".remix-dev-badge");
    expect(styles).toContain("height: 18px;");
  });

  it("gives the Remix session list a deliberate, compact reading rhythm", async () => {
    const shell = await readFile(shellPath, "utf8");
    const styles = await readFile(workspaceStylesPath, "utf8");

    expect(styles).toContain("margin: 0 12px;");
    expect(styles).toContain("margin-top: 6px;");
    expect(styles).toContain("min-height: 34px;");
    expect(styles).toContain("margin: 1px 0;");
    expect(styles).toContain(".tavern-thread-row-direct");
    expect(styles).toContain(
      '.remix-sidebar-sessions-list[data-has-more="true"]',
    );
    expect(shell).toContain("data-has-more={hasMoreSessions || undefined}");
    expect(styles).not.toContain(".remix-sidebar-sessions .tavern-thread-more");
  });

  it("opens session search in a centered command dialog", async () => {
    const shell = await readFile(shellPath, "utf8");

    expect(shell).toContain('className="remix-session-search-dialog"');
    expect(shell).toContain('className="remix-session-search-results"');
    expect(shell).toContain('placeholder="Search sessions"');
    expect(shell).toContain("searchQuery={query}");
  });

  it("keeps the session rows visually clean while exposing matching actions on right-click", async () => {
    const shell = await readFile(shellPath, "utf8");
    const remixSidebar = shell.slice(
      shell.indexOf("function RemixSidebarSessions"),
      shell.indexOf("function WorkspaceSwitcher"),
    );

    expect(remixSidebar).toContain("titleOverrides={localTitles}");
    expect(remixSidebar).toContain("onRename={renameThread}");
    expect(remixSidebar).toContain("onDelete={deleteThread}");
    expect(remixSidebar).toContain('sessionActions="context"');
    expect(remixSidebar).not.toContain("tavern-thread-more");
  });
});
