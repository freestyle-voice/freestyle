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

const DASHBOARD_SCENARIOS = [
  { id: "today", path: "/today" },
  { id: "remix", path: "/remix" },
  { id: "settings-transcription", path: "/settings/transcription" },
  { id: "settings-models", path: "/settings/models" },
  { id: "settings-application", path: "/settings/application" },
  { id: "dictionary", path: "/dictionary" },
  { id: "vocabulary", path: "/vocabulary" },
  { id: "tone", path: "/tone" },
  { id: "profile", path: "/profile" },
  { id: "plugins", path: "/plugins" },
  { id: "help", path: "/help" },
] as const;

const DASHBOARD_URL = "app://renderer/index.html";
const PAGE_DATA_DELAY_MS = 650;
const AUTH_STATUS_DELAY_MS = 1_800;

let app: ElectronApplication | undefined;
let pill: Page;
let dashboard: Page;

async function installDashboardFixtures(page: Page): Promise<void> {
  await page.addInitScript(
    ({ authStatusDelayMs, pageDataDelayMs }) => {
      const visualReviewWindow = window as typeof window & {
        __visualReviewErrors?: string[];
        __visualReviewRequests?: string[];
      };
      visualReviewWindow.__visualReviewErrors = [];
      visualReviewWindow.__visualReviewRequests = [];
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof Request
              ? input.url
              : input.url,
        );
        if (!url.pathname.startsWith("/api/"))
          return originalFetch(input, init);
        visualReviewWindow.__visualReviewRequests?.push(url.pathname);

        if (url.pathname === "/api/client-error") {
          visualReviewWindow.__visualReviewErrors?.push(
            typeof init?.body === "string" ? init.body : "Unknown client error",
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
          });
        }

        const protected401 =
          new URLSearchParams(window.location.search).get("visual") ===
            "protected-401" && url.pathname === "/api/history";
        if (protected401) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const body = (() => {
          if (url.pathname === "/api/auth/status") {
            return {
              authenticated: true,
              user: {
                id: "visual-review-user",
                email: "review@example.test",
                name: "Visual review",
              },
              verified: true,
            };
          }
          if (url.pathname === "/api/history") return { items: [], total: 0 };
          if (url.pathname === "/api/history/stats") {
            return {
              total_sessions: 0,
              total_duration_ms: 0,
              total_input_tokens: 0,
              total_output_tokens: 0,
              total_cost_usd: 0,
              avg_duration_ms: 0,
              total_audio_ms: 0,
              total_fixes: 0,
              total_words: 0,
              today_sessions: 0,
              today_cost: 0,
              unfiltered_total_sessions: 0,
            };
          }
          if (url.pathname === "/api/history/daily") return { days: [] };
          if (url.pathname === "/api/settings") return {};
          if (url.pathname === "/api/dismissed-notifications") return [];
          if (url.pathname === "/api/agent/activity") return { threads: [] };
          if (url.pathname === "/api/agent/thread/latest") {
            return { thread: null };
          }
          if (url.pathname === "/api/agent/thread/list") {
            return { threads: [], nextCursor: null };
          }
          if (url.pathname.startsWith("/api/agent/thread/")) {
            if (url.pathname.endsWith("/runs")) return { runs: [] };
            return {
              thread: null,
              activeTurn: null,
              pendingAction: null,
            };
          }
          if (url.pathname === "/api/usage") {
            return {
              remaining: 2400,
              limit: 3000,
              totalConsumed: 600,
              resetsAt: "2030-01-01T00:00:00.000Z",
              plan: "free",
            };
          }
          if (url.pathname === "/api/config") return { version: 1, flags: {} };
          if (
            url.pathname === "/api/models/available" ||
            url.pathname === "/api/models/configured" ||
            url.pathname === "/api/keys" ||
            url.pathname === "/api/api-keys" ||
            url.pathname === "/api/brain/files" ||
            url.pathname === "/api/brain/notes" ||
            url.pathname === "/api/plugins"
          ) {
            return [];
          }
          if (
            url.pathname === "/api/dictionary" ||
            url.pathname === "/api/vocabulary"
          ) {
            return { items: [], total: 0 };
          }
          if (url.pathname === "/api/connectors/catalog") {
            return { connectors: [], nextCursor: null };
          }
          if (url.pathname === "/api/connectors/connections") {
            return { connections: [] };
          }
          if (url.pathname === "/api/connectors/suggested") {
            return { connectors: [] };
          }
          if (url.pathname === "/api/notifications/token") {
            return { token: null, userId: null };
          }
          return {};
        })();

        await new Promise((resolve) =>
          setTimeout(
            resolve,
            url.pathname === "/api/auth/status"
              ? authStatusDelayMs
              : pageDataDelayMs,
          ),
        );
        return new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
        });
      };
    },
    {
      authStatusDelayMs: AUTH_STATUS_DELAY_MS,
      pageDataDelayMs: PAGE_DATA_DELAY_MS,
    },
  );
}

async function waitForDashboardWindow(
  electronApp: ElectronApplication,
): Promise<Page> {
  const deadline = Date.now() + 5_000;
  let page: Page | undefined;
  while (!page && Date.now() < deadline) {
    page = electronApp
      .windows()
      .find((candidate) => candidate.url().includes("index.html"));
    if (!page) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!page) {
    throw new Error(
      `Dashboard window did not open: ${electronApp
        .windows()
        .map((candidate) => candidate.url())
        .join(", ")}`,
    );
  }
  await page.waitForLoadState("domcontentloaded");
  return page;
}

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), "freestyle-visual-"));
  app = await electron.launch({
    args: [resolve(__dirname, "../out/main/index.js")],
    env: {
      ...process.env,
      NODE_ENV: "development",
      FREESTYLE_E2E: "1",
      FREESTYLE_USER_DATA: userDataDir,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
    timeout: 30_000,
  });
  pill = await app.firstWindow();
  // Wait for Electron's IPC contract before sending the test-only open request.
  // The first window can appear while the main process is still registering
  // handlers during app startup.
  await pill.evaluate(() => window.api.getServerPort());
  await pill.evaluate(() => {
    window.electron.ipcRenderer.send("e2e:open-dashboard");
  });
  dashboard = await waitForDashboardWindow(app);
  await installDashboardFixtures(dashboard);
});

test.afterAll(async () => {
  await app?.close();
});

test("captures every main dashboard page while loading and after data resolves", async ({
  browserName,
}, testInfo) => {
  void browserName;
  for (const scenario of DASHBOARD_SCENARIOS) {
    // Vary the query string as well as the hash. A hash-only navigation would
    // reuse the already-loaded document and skip the fixture init script.
    await dashboard.goto(
      `${DASHBOARD_URL}?visual=${scenario.id}#${scenario.path}`,
    );
    await dashboard
      .locator("html")
      .evaluate((html) => html.classList.add("dark"));
    await expect(dashboard.locator("#root")).not.toBeEmpty();
    await expect(
      dashboard.getByRole("button", { name: "Sign in via browser" }),
    ).toBeHidden();

    if (scenario.id === "today") {
      await expect(dashboard.getByLabel("Loading profile")).toBeVisible();
      await expect(
        dashboard.getByLabel("Loading transcription history"),
      ).toBeVisible();
      await expect(dashboard.getByPlaceholder(/Search/)).toBeVisible();
    }
    if (scenario.id === "remix") {
      await expect(dashboard.getByLabel("Loading profile")).toBeVisible();
      await expect(dashboard.getByLabel("Loading sessions")).toBeVisible();
      await expect(dashboard.getByLabel("Loading conversation")).toBeVisible();
      await expect(
        dashboard.getByRole("button", { name: "Switch workspace" }),
      ).toBeVisible();
    }

    const loading = testInfo.outputPath(`${scenario.id}.loading.png`);
    await dashboard.screenshot({ path: loading });
    await testInfo.attach(`${scenario.id}-loading`, {
      path: loading,
      contentType: "image/png",
    });

    await dashboard.waitForTimeout(
      AUTH_STATUS_DELAY_MS + PAGE_DATA_DELAY_MS + 150,
    );
    // A fixed delay is not sufficient when the lazy route itself loads before
    // it starts its data query. Wait for the semantic loading state to clear
    // so the second capture is genuinely the settled UI rather than another
    // intermediate skeleton.
    await expect(dashboard.getByRole("status")).toHaveCount(0, {
      timeout: 5_000,
    });
    const reportedErrors = await dashboard.evaluate(() => {
      const visualReviewWindow = window as typeof window & {
        __visualReviewErrors?: string[];
      };
      return visualReviewWindow.__visualReviewErrors ?? [];
    });
    expect(reportedErrors).toEqual([]);
    const requestedEndpoints = await dashboard.evaluate(() => {
      const visualReviewWindow = window as typeof window & {
        __visualReviewRequests?: string[];
      };
      return visualReviewWindow.__visualReviewRequests ?? [];
    });
    if (scenario.id === "today") {
      expect(requestedEndpoints).toContain("/api/auth/status");
      expect(requestedEndpoints).toContain("/api/history");
    }
    if (scenario.id === "remix") {
      expect(requestedEndpoints).toContain("/api/auth/status");
      expect(requestedEndpoints).toContain("/api/agent/thread/latest");
    }
    await expect(
      dashboard.getByRole("heading", {
        name: "Freestyle hit an unexpected error.",
      }),
    ).toBeHidden();
    await expect(dashboard.locator("body")).not.toHaveText(/^\s*$/);
    await expect(dashboard.locator("body")).not.toContainText("NaN");
    const loaded = testInfo.outputPath(`${scenario.id}.loaded.png`);
    await dashboard.screenshot({ path: loaded });
    await testInfo.attach(`${scenario.id}-loaded`, {
      path: loaded,
      contentType: "image/png",
    });
  }
});

test("shows full-window sign-in after a protected request returns 401", async () => {
  await dashboard.goto(`${DASHBOARD_URL}?visual=protected-401#/today`);

  await expect(
    dashboard.getByRole("button", { name: "Sign in via browser" }),
  ).toBeVisible();
  await expect(dashboard.locator(".glass-sidebar")).toHaveCount(0);

  const requestedEndpoints = await dashboard.evaluate(() => {
    const visualReviewWindow = window as typeof window & {
      __visualReviewRequests?: string[];
    };
    return visualReviewWindow.__visualReviewRequests ?? [];
  });
  expect(requestedEndpoints).toContain("/api/history");
});
