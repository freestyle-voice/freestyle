import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type ElectronApplication, expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

/**
 * E2E tests for Linux XDG autostart and single-instance lock.
 *
 * These verify that the "Launch at startup" toggle creates and removes a
 * `.desktop` file under `$XDG_CONFIG_HOME/autostart/`.  The env var is
 * pointed at a temporary directory so CI runs leave no side-effects.
 */

let app: ElectronApplication;
let xdgConfigHome: string;

const DESKTOP_FILE = "freestyle.desktop";

async function waitForDashboardWindow(
  electronApp: ElectronApplication,
  timeoutMs = 10_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      const url = win.url();
      if (!url.includes("pill") && url.length > 0) {
        await win.waitForLoadState("domcontentloaded");
        return win;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return electronApp.windows()[0];
}

test.describe("Linux autostart", () => {
  test.skip(process.platform !== "linux", "Linux-only tests");

  test.beforeAll(async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), "freestyle-e2e-autostart-"));
    xdgConfigHome = mkdtempSync(join(tmpdir(), "freestyle-e2e-xdg-"));

    app = await electron.launch({
      args: [resolve(__dirname, "../out/main/index.js")],
      env: {
        ...process.env,
        NODE_ENV: "development",
        FREESTYLE_DB_PATH: join(userDataDir, "freestyle.db"),
        XDG_CONFIG_HOME: xdgConfigHome,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      },
      timeout: 20_000,
    });

    await app.firstWindow();
    await waitForDashboardWindow(app);
  });

  test.afterAll(async () => {
    if (app) await app.close();
    try {
      rmSync(xdgConfigHome, { recursive: true, force: true });
    } catch {}
  });

  test("enabling autostart creates a .desktop file", async () => {
    await app.evaluate(({ ipcMain }) => {
      ipcMain.emit("settings:set-launch-at-startup", {}, true);
    });

    // Small delay for filesystem operations
    await new Promise((r) => setTimeout(r, 200));

    const desktopPath = join(xdgConfigHome, "autostart", DESKTOP_FILE);
    expect(existsSync(desktopPath)).toBe(true);

    const content = readFileSync(desktopPath, "utf-8");
    expect(content).toContain("[Desktop Entry]");
    expect(content).toContain("Type=Application");
    expect(content).toContain("Name=Freestyle");
    expect(content).toContain("Exec=");
    expect(content).toContain("X-GNOME-Autostart-enabled=true");
  });

  test("autostart .desktop file is present after enabling", async () => {
    const desktopPath = join(xdgConfigHome, "autostart", DESKTOP_FILE);
    expect(existsSync(desktopPath)).toBe(true);
  });

  test("disabling autostart removes the .desktop file", async () => {
    await app.evaluate(({ ipcMain }) => {
      ipcMain.emit("settings:set-launch-at-startup", {}, false);
    });

    await new Promise((r) => setTimeout(r, 200));

    const desktopPath = join(xdgConfigHome, "autostart", DESKTOP_FILE);
    expect(existsSync(desktopPath)).toBe(false);
  });

  test("autostart .desktop file is absent after disabling", async () => {
    const desktopPath = join(xdgConfigHome, "autostart", DESKTOP_FILE);
    expect(existsSync(desktopPath)).toBe(false);
  });

  test("app holds single-instance lock", async () => {
    const hasLock = await app.evaluate(({ app: electronApp }) => {
      return electronApp.hasSingleInstanceLock();
    });
    expect(hasLock).toBe(true);
  });
});
