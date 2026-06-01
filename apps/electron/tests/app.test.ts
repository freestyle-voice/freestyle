import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type ElectronApplication,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { _electron as electron } from "playwright";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let app: ElectronApplication;
let dashboardPage: Page;
let serverPort: number;

const DEFAULT_PORT = 4649;

/**
 * Wait for a window whose URL does NOT contain "pill" — that's the
 * dashboard / onboarding window. The pill window loads pill.html and
 * may appear first.
 */
async function waitForDashboardWindow(
  electronApp: ElectronApplication,
  timeoutMs = 10_000,
): Promise<Page> {
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

  // Fallback: return whatever window we have
  return electronApp.windows()[0];
}

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), "freestyle-e2e-"));
  const dbPath = join(userDataDir, "freestyle.db");

  app = await electron.launch({
    args: [resolve(__dirname, "../out/main/index.js")],
    env: {
      ...process.env,
      NODE_ENV: "development",
      FREESTYLE_DB_PATH: dbPath,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
    timeout: 20_000,
  });

  // Wait for the first window so Playwright's internal state is ready.
  await app.firstWindow();

  // Find the dashboard (non-pill) window.
  dashboardPage = await waitForDashboardWindow(app);

  // Resolve the actual server port by probing the default port from the
  // main process. The server starts on DEFAULT_PORT and only falls back
  // to a random port when DEFAULT_PORT is already in use.
  // Note: app.evaluate passes (electronModule, arg) so the user arg is
  // the second parameter.
  const portResult = await app.evaluate(async (_electron, port) => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return port;
    } catch {
      // port not available
    }
    return 0;
  }, DEFAULT_PORT);

  serverPort = portResult || DEFAULT_PORT;
});

test.afterAll(async () => {
  if (app) {
    await app.close();
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("app launches and creates windows", async () => {
  const windows = app.windows();
  expect(windows.length).toBeGreaterThanOrEqual(1);
});

test("main process is responsive", async () => {
  const isPackaged = await app.evaluate(({ app }) => app.isPackaged);
  expect(isPackaged).toBe(false);
});

test("app name is Freestyle", async () => {
  const appName = await app.evaluate(({ app }) => app.getName());
  expect(appName).toBe("Freestyle");
});

test("app version is defined", async () => {
  const version = await app.evaluate(({ app }) => app.getVersion());
  expect(version).toBeTruthy();
  expect(version).toMatch(/^\d+\.\d+/);
});

test("dashboard window loads a valid route", async () => {
  const url = dashboardPage.url();
  const isValidRoute =
    url.includes("/today") ||
    url.includes("/onboarding") ||
    url.includes("index.html");
  expect(isValidRoute).toBe(true);
});

test("dashboard window has a reasonable viewport", async () => {
  const size = dashboardPage.viewportSize();
  if (size) {
    expect(size.width).toBeGreaterThanOrEqual(700);
    expect(size.height).toBeGreaterThanOrEqual(400);
  }
});

test("embedded server is running", async () => {
  const health = await app.evaluate(async (_electron, port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    return res.json() as Promise<{ status: string; name: string }>;
  }, serverPort);
  expect(health).toEqual({ status: "ok", name: "freestyle" });
});

test("settings API works via embedded server", async () => {
  await app.evaluate(async (_electron, port) => {
    await fetch(`http://127.0.0.1:${port}/api/settings/e2e_test`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "hello" }),
    });
  }, serverPort);

  const result = await app.evaluate(async (_electron, port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/settings/e2e_test`);
    return res.json() as Promise<{ key: string; value: string }>;
  }, serverPort);
  expect(result).toEqual({ key: "e2e_test", value: "hello" });
});

test("dashboard renders content", async () => {
  await dashboardPage.waitForTimeout(1000);

  const bodyText = await dashboardPage.locator("body").innerText();
  expect(bodyText.length).toBeGreaterThan(0);
});

test("sidebar navigation is rendered", async () => {
  const url = dashboardPage.url();
  if (url.includes("/onboarding")) {
    // On onboarding page, there's no sidebar but there is content
    const body = await dashboardPage.locator("body").innerText();
    expect(body.length).toBeGreaterThan(0);
    return;
  }

  await dashboardPage.waitForSelector("nav", { timeout: 5000 });
  const navLinks = await dashboardPage.locator("nav a").all();
  expect(navLinks.length).toBe(6);
});
