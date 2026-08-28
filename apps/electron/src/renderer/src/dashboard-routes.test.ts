import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dashboardPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "dashboard.tsx",
);

describe("dashboard routes", () => {
  it("keeps every Dictate sidebar destination on its dedicated page", async () => {
    const dashboard = await readFile(dashboardPath, "utf8");

    const routes = [
      ["/settings/vocabulary", "VocabularyPage"],
      ["/settings/dictionary", "DictionaryPage"],
      ["/settings/tone", "TonePage"],
      ["/settings/models", "ModelsPage"],
      ["/plugins", "PluginsPage"],
      ["/plugins/:slug", "PluginDetailPage"],
      ["/plugins/:slug/:pageId", "PluginPage"],
    ] as const;

    for (const [path, page] of routes) {
      expect(dashboard).toMatch(
        new RegExp(
          `<Route\\s+path="${path}"\\s+element=\\{<${page}\\s*\\/>\\}\\s*\\/>`,
          "s",
        ),
      );
    }
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
      /<Route\s+path="\/help"\s+element=\{<HelpPage\s*\/>\}\s*\/>/s,
    );
  });

  it("keeps Profile as its own user-menu destination", async () => {
    const dashboard = await readFile(dashboardPath, "utf8");

    expect(dashboard).toContain(
      'const ProfilePage = lazy(() => import("@renderer/pages/profile"))',
    );
    expect(dashboard).toMatch(
      /<Route\s+path="\/profile"\s+element=\{<ProfilePage\s*\/>\}\s*\/>/s,
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
