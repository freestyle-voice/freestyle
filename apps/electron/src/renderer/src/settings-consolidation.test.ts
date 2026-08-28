import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

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
});
