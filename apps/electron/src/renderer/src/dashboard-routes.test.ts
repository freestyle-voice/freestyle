import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dashboardPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "dashboard.tsx",
);
const tonePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "pages/tone.tsx",
);

describe("dashboard routes", () => {
  it("keeps every Dictate sidebar destination on its dedicated page", async () => {
    const dashboard = await readFile(dashboardPath, "utf8");

    const routes = [
      ["/vocabulary", "VocabularyPage"],
      ["/dictionary", "DictionaryPage"],
      ["/tone", "TonePage"],
      ["/plugins", "PluginsPage"],
      ["/plugins/:slug", "PluginDetailPage"],
      ["/plugins/:slug/:pageId", "PluginPage"],
    ] as const;

    for (const [path, page] of routes) {
      expect(dashboard).toMatch(
        new RegExp(
          `<Route\\s+path="${path}"\\s+element=\\{\\s*<LazyRoute>\\s*<${page}\\s*\\/>\\s*</LazyRoute>\\s*\\}\\s*\\/>`,
          "s",
        ),
      );
    }
  });

  it("keeps Models in Settings and redirects the retired Dictate URL", async () => {
    const dashboard = await readFile(dashboardPath, "utf8");

    for (const [legacyPath, appPath] of [
      ["/settings/vocabulary", "/vocabulary"],
      ["/settings/dictionary", "/dictionary"],
      ["/settings/tone", "/tone"],
    ]) {
      expect(dashboard).toMatch(
        new RegExp(
          `<Route\\s+path="${legacyPath}"\\s+element=\\{\\s*<Navigate\\s+to="${appPath}"\\s+replace\\s*\\/>\\s*\\}\\s*\\/>`,
          "s",
        ),
      );
    }

    expect(dashboard).toMatch(
      /<Route\s+path="\/settings\/models"\s+element=\{\s*<LazyRoute>\s*<ModelsPage\s*\/>\s*<\/LazyRoute>\s*\}\s*\/>/s,
    );
    expect(dashboard).toMatch(
      /<Route\s+path="\/models"\s+element=\{\s*<Navigate\s+to="\/settings\/models"\s+replace\s*\/>\s*\}\s*\/>/s,
    );
  });

  it("takes Dictate cleanup controls to the shared model settings", async () => {
    const tone = await readFile(tonePath, "utf8");

    expect(tone).toContain('<Link to="/settings/models">');
    expect(tone).not.toContain('to="/models"');
  });

  it("loads the legacy Models page as a route-level chunk", async () => {
    const dashboard = await readFile(dashboardPath, "utf8");

    expect(dashboard).toContain(
      'const ModelsPage = lazy(() => import("@renderer/pages/models"))',
    );
  });

  it("renders the Help page for the user-menu destination", async () => {
    const dashboard = await readFile(dashboardPath, "utf8");

    expect(dashboard).toContain('import HelpPage from "@renderer/pages/help"');
    expect(dashboard).toMatch(
      /<Route\s+path="\/help"\s+element=\{\s*<LazyRoute>\s*<HelpPage\s*\/>\s*<\/LazyRoute>\s*\}\s*\/>/s,
    );
  });

  it("keeps Profile as its own user-menu destination", async () => {
    const dashboard = await readFile(dashboardPath, "utf8");

    expect(dashboard).toContain(
      'const ProfilePage = lazy(() => import("@renderer/pages/profile"))',
    );
    expect(dashboard).toMatch(
      /<Route\s+path="\/profile"\s+element=\{\s*<LazyRoute>\s*<ProfilePage\s*\/>\s*<\/LazyRoute>\s*\}\s*\/>/s,
    );
  });

  it("uses the persisted workspace for the startup route", async () => {
    const dashboard = await readFile(dashboardPath, "utf8");

    expect(dashboard).toContain("function DashboardHomeRedirect()");
    expect(dashboard).toContain("WORKSPACE_STORAGE_KEY");
    expect(dashboard).toContain("workspaceHomeRoute(workspace)");
    expect(dashboard).toContain("element={<DashboardHomeRedirect />}");
    expect(dashboard).not.toContain(
      'element={<Navigate to="/remix" replace />}',
    );
  });
});
