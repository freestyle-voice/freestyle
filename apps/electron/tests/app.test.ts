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
let companionPage: Page;
let serverPort: number;

const DEFAULT_PORT = 4649;

/** The companion (corner sprite) is the app's only boot window. */
async function waitForCompanionWindow(
  electronApp: ElectronApplication,
  timeoutMs = 10_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      if (win.url().includes("companion")) {
        await win.waitForLoadState("domcontentloaded");
        return win;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
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

    await app.firstWindow();
    companionPage = await waitForCompanionWindow(app, 15_000);

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
  const windows = app?.windows() ?? [];
  expect(windows.length).toBeGreaterThanOrEqual(1);
});

test("main process is responsive", async () => {
  const isPackaged = await app?.evaluate(({ app }) => app.isPackaged);
  expect(isPackaged).toBe(false);
});

test("app name is Freestyle", async () => {
  const appName = await app?.evaluate(({ app }) => app.getName());
  expect(appName).toBe("Freestyle");
});

test("app version is defined", async () => {
  const version = await app?.evaluate(({ app }) => app.getVersion());
  expect(version).toBeTruthy();
  expect(version).toMatch(/^\d+\.\d+/);
});

test("companion window boots", async () => {
  expect(companionPage.url()).toContain("companion");
  const body = await companionPage.locator("body").count();
  expect(body).toBe(1);
});

test("embedded server answers health checks", async () => {
  const res = await fetch(`http://127.0.0.1:${serverPort}/api/health`);
  expect(res.ok).toBe(true);
});

test("companion is served from the trusted app:// origin", async () => {
  expect(companionPage.url()).toMatch(/^app:\/\/renderer\//);
});

test("companion can open the dictation WebSocket", async () => {
  const outcome = await companionPage.evaluate(
    (port) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/stream`);
        const timer = setTimeout(() => {
          ws.close();
          resolve("timeout");
        }, 8_000);
        ws.onmessage = (event) => {
          clearTimeout(timer);
          ws.close();
          resolve(`message:${String(event.data).slice(0, 40)}`);
        };
        ws.onclose = (event) => {
          clearTimeout(timer);
          resolve(`closed:${event.code}`);
        };
      }),
    serverPort,
  );
  expect(outcome).toMatch(/^message:\{"type":"(config|error)"/);
});

test("no dashboard window exists", async () => {
  const urls = (app?.windows() ?? []).map((w) => w.url());
  for (const url of urls) {
    expect(url).not.toContain("index.html");
    expect(url).not.toContain("pill");
  }
});
