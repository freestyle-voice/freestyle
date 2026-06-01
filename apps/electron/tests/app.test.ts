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

/**
 * Launch the Electron app with a temporary user-data directory so
 * tests never touch real data. The app is built with `electron-vite build`
 * and the main entry is `out/main/index.js`.
 */
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

  // The app creates a pill window (small, always-on-top) immediately,
  // and a settings/dashboard window on first launch (onboarding).
  // Wait for the first window, then try to find the dashboard.
  dashboardPage = await app.firstWindow();
  await dashboardPage.waitForLoadState("domcontentloaded");

  // If we got the pill, look for the dashboard window
  const windows = app.windows();
  for (const win of windows) {
    const url = win.url();
    if (
      url.includes("index.html") ||
      url.includes("/today") ||
      url.includes("/onboarding") ||
      url.includes("app://renderer")
    ) {
      dashboardPage = win;
      break;
    }
  }
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
    url.includes("index.html") ||
    url.includes("app://renderer");
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
  // Query the health endpoint from the main process to avoid
  // CORS issues in the renderer.
  const health = await app.evaluate(async () => {
    const res = await fetch("http://127.0.0.1:4649/api/health");
    return res.json() as Promise<{ status: string; name: string }>;
  });
  expect(health).toEqual({ status: "ok", name: "freestyle" });
});

test("settings API works via embedded server", async () => {
  // Write a setting and read it back via the embedded server
  await app.evaluate(async () => {
    await fetch("http://127.0.0.1:4649/api/settings/e2e_test", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "hello" }),
    });
  });

  const result = await app.evaluate(async () => {
    const res = await fetch("http://127.0.0.1:4649/api/settings/e2e_test");
    return res.json() as Promise<{ key: string; value: string }>;
  });
  expect(result).toEqual({ key: "e2e_test", value: "hello" });
});

test("dashboard renders content", async () => {
  // Wait for at least some content to render
  await dashboardPage.waitForTimeout(1000);

  // The page should have some text content
  const bodyText = await dashboardPage.locator("body").innerText();
  expect(bodyText.length).toBeGreaterThan(0);
});

test("sidebar navigation is rendered", async () => {
  const url = dashboardPage.url();
  if (url.includes("/onboarding")) {
    // On onboarding page, there's no sidebar
    const body = await dashboardPage.locator("body").innerText();
    expect(body.length).toBeGreaterThan(0);
    return;
  }

  await dashboardPage.waitForSelector("nav", { timeout: 5000 });
  const navLinks = await dashboardPage.locator("nav a").all();
  expect(navLinks.length).toBe(6);
});
