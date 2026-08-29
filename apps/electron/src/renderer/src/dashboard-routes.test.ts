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
      ["/models", "ModelsPage"],
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

  it("keeps old Dictate settings links as redirects instead of a second sidebar", async () => {
    const dashboard = await readFile(dashboardPath, "utf8");

    for (const [legacyPath, appPath] of [
      ["/settings/vocabulary", "/vocabulary"],
      ["/settings/dictionary", "/dictionary"],
      ["/settings/tone", "/tone"],
      ["/settings/models", "/models"],
    ]) {
      expect(dashboard).toMatch(
        new RegExp(
          `<Route\\s+path="${legacyPath}"\\s+element=\\{\\s*<Navigate\\s+to="${appPath}"\\s+replace\\s*\\/>\\s*\\}\\s*\\/>`,
          "s",
        ),
      );
    }
  });

  it("keeps Dictate cross-links out of Settings", async () => {
    const tone = await readFile(tonePath, "utf8");

    expect(tone).toContain('<Link to="/models">');
    expect(tone).not.toContain('to="/settings/models"');
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
