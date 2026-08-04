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

let app: ElectronApplication | undefined;
let dashboardPage: Page;
let serverPort: number;

const DEFAULT_PORT = 4649;

/**
 * Wait for a window whose URL is neither the pill nor the remix bar —
 * that's the dashboard / onboarding window. The pill (pill.html) and the
 * remix bar (bar.html) are auxiliary windows and may appear first.
 */
async function waitForDashboardWindow(
  electronApp: ElectronApplication,
  timeoutMs = 10_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      const url = win.url();
      if (
        !url.includes("pill") &&
        !url.includes("bar.html") &&
        url.length > 0
      ) {
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

  try {
    app = await electron.launch({
      args: [resolve(__dirname, "../out/main/index.js")],
      env: {
        ...process.env,
        NODE_ENV: "development",
        FREESTYLE_DB_PATH: dbPath,
        FREESTYLE_E2E: "1",
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      },
      timeout: 30_000,
    });

    // Wait for the first window so Playwright's internal state is ready.
    await app.firstWindow();

    // Find the dashboard (non-pill) window.
    dashboardPage = await waitForDashboardWindow(app, 15_000);
    try {
      await dashboardPage.waitForLoadState("networkidle", { timeout: 15_000 });
    } catch {
      // Embedded server keeps connections open; networkidle may never fire.
      await dashboardPage.waitForLoadState("load", { timeout: 10_000 });
    }

    // Resolve the actual server port by probing the default port from the
    // main process. The server starts on DEFAULT_PORT and only falls back
    // to a random port when DEFAULT_PORT is already in use.
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
  } catch (error) {
    console.error("Failed to launch Electron app:", error);
    if (app) {
      await app.close().catch(console.error);
      app = undefined;
    }
    throw error;
  }
});

test.afterAll(async () => {
  if (!app) return;
  const proc = app.process();
  const killTimer = setTimeout(() => proc.kill("SIGKILL"), 10_000);
  try {
    await app.close();
  } catch (error) {
    console.warn("Error closing app:", error);
    proc.kill("SIGKILL");
  } finally {
    clearTimeout(killTimer);
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
  const body = dashboardPage.locator("body");

  if (dashboardPage.url().includes("/onboarding")) {
    await body.waitFor({ state: "visible" });
    expect((await body.innerText()).length).toBeGreaterThan(0);
    return;
  }

  await dashboardPage.waitForSelector("main, nav", { timeout: 10_000 });

  await body.waitFor({ state: "visible" });
  const bodyText = await body.innerText();
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

  // Signed out, /today shows the login gate instead of the shell — assert
  // that page rather than a sidebar that deliberately isn't there.
  const signIn = dashboardPage.getByRole("button", {
    name: "Sign in via browser",
  });
  if (await signIn.isVisible().catch(() => false)) {
    await expect(signIn).toBeEnabled();
    return;
  }

  await dashboardPage.waitForSelector("nav", { timeout: 10_000 });
  // The exact link count varies by state (signed-in hides the footer group,
  // advanced mode reveals Models, plugins append) — assert the core set.
  const navLinks = await dashboardPage.locator("nav a").all();
  expect(navLinks.length).toBeGreaterThanOrEqual(6);
});

// Runs LAST among the dashboard tests: completing onboarding changes the
// window's route (and, signed out, lands on the login gate), which the
// earlier tests must not inherit.
test("onboarding flow reaches the draft and remix steps and completes", async () => {
  test.skip(
    !dashboardPage.url().includes("/onboarding"),
    "onboarding is not active in this run",
  );
  const page = dashboardPage;

  // Cloud step — E2E takes the skip affordance.
  await page.getByRole("button", { name: "Skip for now (dev)" }).click();

  // Permissions step — E2E bypasses the OS grants.
  await page.getByRole("button", { name: "Continue" }).click();

  // Language step.
  await page.getByRole("button", { name: "Continue" }).click();

  // Draft step — the Gmail mockup. Typing into the body enables Continue.
  await page.getByText("New Message").waitFor({ state: "visible" });
  const continueButton = page.getByRole("button", { name: "Continue" });
  await expect(continueButton).toBeDisabled();
  const body = page.locator('[role="textbox"]');
  await body.click();
  await body.fill("Happy birthday Sam — cake on Friday.");
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  // Remix step — renders the non-interactive scripted variant under E2E.
  await page
    .getByText("Remix needs an assistant model", { exact: false })
    .waitFor({ state: "visible", timeout: 15_000 });

  await page.getByRole("button", { name: "Start using Freestyle" }).click();
  await page.waitForURL(/\/today/, { timeout: 15_000 });

  // Practice-target mode must be off once onboarding is done.
  const practiceTarget = await page.evaluate(() =>
    (
      window as unknown as {
        electron: {
          ipcRenderer: { invoke: (channel: string) => Promise<boolean> };
        };
      }
    ).electron.ipcRenderer.invoke("e2e:remix-practice-target"),
  );
  expect(practiceTarget).toBe(false);
});
