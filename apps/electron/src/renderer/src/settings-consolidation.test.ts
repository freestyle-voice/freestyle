import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));
const shellPath = resolve(rendererRoot, "shell.tsx");
const dashboardPath = resolve(rendererRoot, "dashboard.tsx");
const globalsPath = resolve(rendererRoot, "globals.css");

describe("settings consolidation", () => {
  it("keeps the former Remix-only data controls in dedicated Settings", async () => {
    const settings = await readFile(
      resolve(rendererRoot, "pages/settings.tsx"),
      "utf8",
    );

    expect(settings).toContain("NotificationsHistory");
    expect(settings).toContain('apiFetch("/api/brain/export")');
    expect(settings).toContain('apiFetch("/api/brain/clear"');
  });

  it("does not retain a second settings surface in the Remix workspace", async () => {
    const panel = await readFile(
      resolve(rendererRoot, "components/panel.tsx"),
      "utf8",
    );
    const remixStyles = await readFile(
      resolve(rendererRoot, "remix-workspace.css"),
      "utf8",
    );

    expect(panel).not.toContain("SettingsView");
    expect(panel).not.toContain('aria-label="Settings"');
    expect(panel).not.toContain("remix-inline-settings");
    expect(remixStyles).not.toContain("remix-inline-settings");
  });

  it("keeps the remix workspace affordance out of Settings", async () => {
    const settings = await readFile(
      resolve(rendererRoot, "pages/settings.tsx"),
      "utf8",
    );

    expect(settings).not.toContain("remix_bar_enabled");
    expect(settings).not.toContain("remixBarEnabled");
    expect(settings).not.toContain('label="Remix bar"');
  });

  it("uses the app sidebar as the only settings navigation", async () => {
    const [settings, shell, dashboard, globals] = await Promise.all([
      readFile(resolve(rendererRoot, "pages/settings.tsx"), "utf8"),
      readFile(shellPath, "utf8"),
      readFile(dashboardPath, "utf8"),
      readFile(globalsPath, "utf8"),
    ]);

    expect(settings).toContain("useParams");
    expect(settings).not.toContain("function SettingsSidebar");
    expect(shell).toContain("function SettingsSidebar");
    expect(shell).toContain('to: "/settings/transcription"');
    expect(shell).toContain('to: "/settings/apps"');
    expect(shell).toContain('to: "/settings/network"');
    const settingsNavigation = shell.slice(
      shell.indexOf("const SETTINGS_NAV_GROUPS"),
      shell.indexOf("function NavList"),
    );
    expect(settingsNavigation).not.toContain('to: "/settings/vocabulary"');
    expect(settingsNavigation).not.toContain('to: "/settings/dictionary"');
    expect(settingsNavigation).not.toContain('to: "/settings/tone"');
    expect(settingsNavigation).toContain('to: "/settings/models"');
    const dictationGroup = settingsNavigation.slice(
      settingsNavigation.indexOf('label: "Dictation"'),
      settingsNavigation.indexOf('label: "Remix"'),
    );
    const generalGroup = settingsNavigation.slice(
      settingsNavigation.indexOf('label: "General"'),
      settingsNavigation.indexOf("function NavList"),
    );
    expect(dictationGroup).not.toContain('to: "/settings/models"');
    expect(generalGroup).toContain('to: "/settings/models"');
    expect(settingsNavigation).not.toContain('to: "/plugins"');
    expect(shell).toContain('to: "/vocabulary"');
    expect(shell).toContain('to: "/dictionary"');
    expect(shell).toContain('to: "/tone"');
    expect(shell).not.toContain('to: "/models"');
    expect(settings).toContain("responsive-page-scroll min-h-0 flex-1");
    expect(globals).toMatch(
      /\.responsive-page-scroll\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s,
    );
    expect(shell).toContain("onClick={onBack}");
    expect(shell).toMatch(
      /style=\{\{ WebkitAppRegion: "no-drag" \} as React\.CSSProperties\}/,
    );
    expect(settings).toContain('network: "network"');
    expect(dashboard).toMatch(
      /<Route\s+path="\/settings\/:section"\s+element=\{<SettingsPage\s*\/>\}\s*\/>/s,
    );
  });

  it("uses an account-management view instead of plan comparisons for Pro", async () => {
    const settings = await readFile(
      resolve(rendererRoot, "pages/settings.tsx"),
      "utf8",
    );
    const upgradeModal = await readFile(
      resolve(rendererRoot, "components/upgrade-modal.tsx"),
      "utf8",
    );

    expect(settings).toContain("isPro ? (");
    expect(settings).toContain("<ProMembership");
    expect(settings).toContain("isPro={false}");
    expect(settings).toContain("{!isPro && (");
    expect(upgradeModal).toContain('aria-label="Pro membership"');
    expect(upgradeModal).toContain(
      "Everything in Pro is ready across your devices.",
    );
    expect(upgradeModal).toContain("Manage subscription");
  });

  it("makes the desktop companion an explicit local-only opt-in", async () => {
    const [settings, shell] = await Promise.all([
      readFile(resolve(rendererRoot, "pages/settings.tsx"), "utf8"),
      readFile(shellPath, "utf8"),
    ]);

    expect(settings).toMatch(/window\.api\s*\.petEnabled\(\)/);
    expect(settings).toContain("window.api.setPetEnabled(enabled)");
    expect(settings).toContain('label="Show desktop companion"');
    expect(settings).toContain("never records or controls your dictation");
    expect(settings).toContain("disabled={!petEnabled}");
    expect(settings).toContain('activeSection === "companion"');
    expect(settings).toContain("window.api.wakeCompanion()");
    expect(shell).toContain('to: "/settings/companion"');
  });
});
