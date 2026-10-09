import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
let pillPage: Page;
let serverPort: number;
let userDataDir: string;

/** The pill is the default boot surface. */
async function waitForPillWindow(
  electronApp: ElectronApplication,
  timeoutMs = 10_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      if (win.url().includes("pill")) {
        await win.waitForLoadState("domcontentloaded");
        return win;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return electronApp.windows()[0];
}

async function waitForWorkspaceWindow(
  electronApp: ElectronApplication,
  timeoutMs = 10_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      if (win.url().includes("panel")) {
        await win.waitForLoadState("domcontentloaded");
        return win;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Workspace window did not open");
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "freestyle-e2e-"));
  writeFileSync(
    join(userDataDir, "settings.json"),
    JSON.stringify({
      companionForm: "jeb",
      companionPositions: { "1": { x: 32, y: 48 } },
      petEnabled: true,
      showDashboardOnLaunch: false,
    }),
  );

  try {
    app = await electron.launch({
      args: [resolve(__dirname, "../out/main/index.js")],
      env: {
        ...process.env,
        NODE_ENV: "development",
        FREESTYLE_E2E: "1",
        // The main process owns FREESTYLE_DB_PATH from Electron's user-data
        // directory. Point Electron itself at the fixture so this test cannot
        // inherit a developer's settings or local history.
        FREESTYLE_USER_DATA: userDataDir,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      },
      timeout: 30_000,
    });

    await app.firstWindow();
    pillPage = await waitForPillWindow(app, 15_000);

    // Ask the app that was just launched rather than probing 4649. Isolated
    // E2E uses a random port so it cannot attach to a developer's live app.
    serverPort = await pillPage.evaluate(() => window.api.getServerPort());
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

test("removes legacy companion preferences on startup", () => {
  const settings = JSON.parse(
    readFileSync(join(userDataDir, "settings.json"), "utf8"),
  ) as Record<string, unknown>;

  expect(settings).not.toHaveProperty("companionForm");
  expect(settings).not.toHaveProperty("companionPositions");
  expect(settings).not.toHaveProperty("petEnabled");
  expect(settings.showDashboardOnLaunch).toBe(false);
});

test("pill window boots", async () => {
  expect(pillPage.url()).toContain("pill");
  const body = await pillPage.locator("body").count();
  expect(body).toBe(1);
});

test("embedded server answers health checks", async () => {
  const res = await fetch(`http://127.0.0.1:${serverPort}/api/health`);
  expect(res.ok).toBe(true);
});

test("pill is served from the trusted app:// origin", async () => {
  expect(pillPage.url()).toMatch(/^app:\/\/renderer\//);
});

test("pill can open the dictation WebSocket", async () => {
  const outcome = await pillPage.evaluate(
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

test("workspace opens as a primary application window", async () => {
  await pillPage.evaluate(() => {
    window.electron.ipcRenderer.send("e2e:open-panel");
  });
  const workspace = await waitForWorkspaceWindow(app!);
  await expect(
    workspace.getByRole("button", { name: "Continue without an account" }),
  ).toBeVisible();

  const properties = await app!.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes("panel.html"),
    );
    if (!window) return null;
    return {
      bounds: window.getBounds(),
      alwaysOnTop: window.isAlwaysOnTop(),
      resizable: window.isResizable(),
    };
  });

  expect(properties).not.toBeNull();
  expect(properties?.bounds.width).toBeGreaterThanOrEqual(900);
  expect(properties?.bounds.height).toBeGreaterThanOrEqual(680);
  expect(properties?.alwaysOnTop).toBe(false);
  expect(properties?.resizable).toBe(true);
});

test("workspace uses the restored legacy dark visual system", async () => {
  await pillPage.evaluate(() => {
    window.electron.ipcRenderer.send("e2e:open-panel");
  });
  const workspace = await waitForWorkspaceWindow(app!);
  // ThemeProvider owns this class. Changing Electron's nativeTheme after a
  // renderer launches does not reliably update prefers-color-scheme in
  // headless Linux, so assert the dark visual contract at that boundary.
  await workspace.locator("html").evaluate((html) => {
    html.classList.add("dark");
  });
  const visual = await workspace.locator("html").evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      primary: root.getPropertyValue("--primary").trim(),
      canvas: root.getPropertyValue("--background").trim(),
    };
  });

  expect(visual.primary).toBe("#8ab62a");
  expect(visual.canvas).toBe("#16140f");
});

test("application quit exits cleanly and releases its embedded server port", async () => {
  const runningApp = app!;
  const process = runningApp.process();
  const nativePids: number[] = [];
  if (globalThis.process.platform !== "win32" && process.pid) {
    try {
      nativePids.push(
        ...execFileSync(
          "pgrep",
          ["-P", String(process.pid), "-f", "key-listener"],
          { encoding: "utf8" },
        )
          .trim()
          .split(/\s+/)
          .map(Number),
      );
    } catch (error) {
      // pgrep exits 1 when native helpers are unavailable in a headless runner.
      if ((error as { status?: number }).status !== 1) throw error;
    }
  }
  const exited = new Promise<{ code: number | null; signal: string | null }>(
    (resolve) => {
      process.once("exit", (code, signal) => resolve({ code, signal }));
    },
  );
  // Schedule quit so the evaluate response arrives before Electron tears down
  // Playwright's connection. Unlike afterAll, this assertion permits no forced kill.
  await runningApp.evaluate(({ app }) => {
    setTimeout(() => app.quit(), 25);
  });
  await expect.poll(() => process.exitCode, { timeout: 15_000 }).toBe(0);
  expect(await exited).toEqual({ code: 0, signal: null });
  for (const pid of nativePids) {
    await expect
      .poll(
        () => {
          try {
            globalThis.process.kill(pid, 0);
            return true;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
            return false;
          }
        },
        { timeout: 5_000 },
      )
      .toBe(false);
  }
  await expect(
    fetch(`http://127.0.0.1:${serverPort}/api/health`),
  ).rejects.toThrow();
  app = undefined;
});
