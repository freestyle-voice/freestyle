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

const STATIC_LOADING_HEADINGS: Partial<
  Record<(typeof DASHBOARD_SCENARIOS)[number]["id"], RegExp>
> = {
  "settings-transcription": /Dictation/,
  "settings-models": /Models/,
  "settings-application": /Application/,
  dictionary: /Shortcuts/,
  vocabulary: /Vocabulary/,
  tone: /Tone/,
  profile: /Profile/,
  plugins: /Plugins/,
};

let app: ElectronApplication | undefined;
let pill: Page;
let dashboard: Page;

async function dashboardWindowButtonPosition(): Promise<{
  x: number;
  y: number;
} | null> {
  return app!.evaluate(({ BrowserWindow }) => {
    const panel = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes("index.html"),
    );
    return panel?.getWindowButtonPosition() ?? null;
  });
}

async function expectDashboardWindowButtonPosition(position: {
  x: number;
  y: number;
}): Promise<void> {
  if (process.platform !== "darwin") return;
  await expect.poll(dashboardWindowButtonPosition).toEqual(position);
}

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
      let signedOut = false;
      const scenario = new URLSearchParams(window.location.search).get(
        "visual",
      );
      let guest = scenario?.startsWith("guest") ?? false;
      const fixtureUser = {
        id: "visual-review-user",
        email: "review@example.test",
        name: "Visual review",
      };
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

        const personalScenario =
          scenario === "guest-remix-local" || scenario === "guest-remix-byok";
        const provider =
          scenario === "guest-remix-byok" ? "openai" : "local-llm";
        const model = {
          provider_id: provider,
          provider_name: provider === "openai" ? "OpenAI" : "Local LLM",
          model_id:
            provider === "local-llm"
              ? "local-llm/Personal chat model"
              : `${provider}/test-chat`,
          model_name: "Personal chat model",
          type: "llm",
          curated: true,
        };
        const selectionKey = `${scenario}:model`;
        const historyKey = `${scenario}:history`;
        const selectedModel = JSON.parse(
          localStorage.getItem(selectionKey) ?? "null",
        );
        const localThreads = JSON.parse(
          localStorage.getItem(historyKey) ?? "[]",
        );
        const method =
          init?.method ?? (input instanceof Request ? input.method : "GET");
        const requestBody = async (): Promise<string> =>
          init?.body !== undefined
            ? String(init.body)
            : input instanceof Request
              ? input.clone().text()
              : "";
        if (url.pathname === "/api/remix/sessions/runtime") {
          return Response.json(
            personalScenario && selectedModel
              ? {
                  kind: "local",
                  model: {
                    provider: selectedModel.provider,
                    model_id: selectedModel.model_id,
                    model_name: selectedModel.model_name,
                  },
                }
              : { kind: "managed" },
          );
        }
        if (personalScenario) {
          if (url.pathname === "/api/test-sign-in") {
            guest = false;
            return Response.json({ ok: true });
          }
          if (url.pathname === "/api/settings/local-llm/test")
            return Response.json({
              ok: true,
              models: ["Personal chat model", "Second chat model"],
            });
          if (url.pathname === "/api/models/available")
            return Response.json([
              model,
              {
                ...model,
                model_id:
                  provider === "local-llm"
                    ? "local-llm/Second chat model"
                    : `${provider}/second-chat`,
                model_name: "Second chat model",
              },
            ]);
          if (url.pathname === "/api/models/configured") {
            if (method === "POST") {
              const configured = {
                ...JSON.parse(await requestBody()),
                id: 1,
                is_default: 1,
              };
              localStorage.setItem(selectionKey, JSON.stringify(configured));
              return Response.json(configured);
            }
            return Response.json(selectedModel ? [selectedModel] : []);
          }
          if (url.pathname === "/api/keys/validate")
            return Response.json({ valid: true });
          if (url.pathname === "/api/keys") {
            if (method === "POST")
              localStorage.setItem(`${scenario}:key`, "saved");
            return Response.json(
              localStorage.getItem(`${scenario}:key`)
                ? [{ provider, status: "valid" }]
                : [],
            );
          }
          if (url.pathname === "/api/remix/sessions" && method === "POST") {
            if (
              scenario === "guest-remix-local" &&
              !localStorage.getItem(`${scenario}:startup-retried`)
            ) {
              localStorage.setItem(`${scenario}:startup-retried`, "true");
              return Response.json({ error: "unavailable" }, { status: 503 });
            }
            const next = {
              id: crypto.randomUUID(),
              type: "local",
              title: null,
              messages: [],
              model: {
                provider: selectedModel.provider,
                modelId: selectedModel.model_id,
                modelName: selectedModel.model_name,
              },
              lastActiveAt: new Date()
                .toISOString()
                .slice(0, 19)
                .replace("T", " "),
            };
            localStorage.setItem(
              historyKey,
              JSON.stringify([next, ...localThreads]),
            );
            return Response.json({ thread: next }, { status: 201 });
          }
          if (url.pathname === "/api/remix/sessions/local/latest") {
            if (
              scenario === "guest-remix-byok" &&
              !localStorage.getItem(`${scenario}:startup-retried`)
            ) {
              localStorage.setItem(`${scenario}:startup-retried`, "true");
              return Response.json({ error: "unavailable" }, { status: 503 });
            }
            return Response.json({ thread: localThreads[0] ?? null });
          }
          if (url.pathname === "/api/remix/sessions/local")
            return Response.json({ threads: localThreads, nextCursor: null });
          const session = localThreads.find(
            (item: { id: string }) => item.id === url.pathname.split("/")[4],
          );
          if (session) {
            if (url.pathname.endsWith("/stream")) {
              const parts = [
                { type: "start", messageId: crypto.randomUUID() },
                { type: "text-start", id: "reply" },
                {
                  type: "text-delta",
                  id: "reply",
                  delta: `Hello from ${session.model.modelName}.`,
                },
                { type: "text-end", id: "reply" },
                { type: "finish", finishReason: "stop" },
              ];
              return new Response(
                `${parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join("")}data: [DONE]\n\n`,
                {
                  headers: {
                    "Content-Type": "text/event-stream",
                    "x-vercel-ai-ui-message-stream": "v1",
                  },
                },
              );
            }
            if (url.pathname.endsWith("/messages") && method === "PUT") {
              session.messages = JSON.parse(await requestBody()).messages;
              localStorage.setItem(
                historyKey,
                JSON.stringify([
                  session,
                  ...localThreads.filter(
                    (item: { id: string }) => item.id !== session.id,
                  ),
                ]),
              );
              return Response.json({ ok: true });
            }
            return Response.json({ thread: session });
          }
        }

        if (scenario === "guest-sidebar") {
          if (url.pathname === "/api/auth/device/code") {
            return Response.json({
              device_code: "sidebar-test-device",
              user_code: "SIDEBAR",
              verification_uri: "https://example.test/device",
              expires_in: 60,
              interval: 1,
            });
          }
          if (url.pathname === "/api/auth/device/token") {
            guest = false;
            return Response.json({ user: fixtureUser });
          }
        }

        if (
          scenario === "guest-connectors" &&
          url.pathname === "/api/auth/device/code"
        ) {
          return Response.json({ error: "test_sign_in" }, { status: 503 });
        }
        if (
          scenario === "guest-connectors" &&
          url.pathname === "/api/connectors"
        ) {
          return Response.json(
            { error: "cloud_auth_required" },
            { status: 401 },
          );
        }

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

        if (
          url.pathname === "/api/auth/sign-out" ||
          url.pathname === "/api/test-expiry"
        )
          signedOut = true;
        if (
          url.pathname === "/api/settings/onboarding" &&
          init?.method === "PUT"
        ) {
          localStorage.setItem("visual.guest-onboarding", "done");
        }
        // Guests cannot load managed conversations; onboarding must still resolve.
        if (guest && url.pathname.startsWith("/api/agent/")) {
          return new Response(
            JSON.stringify({ error: "cloud_auth_required" }),
            {
              status: 401,
              headers: { "content-type": "application/json" },
            },
          );
        }
        const thread = {
          id: "visual-review-thread",
          type: "remote",
          title: "Sidebar layout",
          messages: [
            {
              id: "visual-review-message",
              role: "assistant",
              parts: [{ type: "text", text: "Ready when you are." }],
            },
          ],
        };
        const body = (() => {
          if (url.pathname === "/api/auth/status") {
            if (guest || signedOut)
              return { authenticated: false, user: null, verified: true };
            return {
              authenticated: true,
              user: fixtureUser,
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
          if (url.pathname === "/api/settings") {
            if (
              scenario === "guest-first-run" &&
              !localStorage.getItem("visual.guest-onboarding")
            )
              return {};
            return {
              onboarding: JSON.stringify({ v: 2, done: true }),
              ...(scenario === "cloud-expiry"
                ? { llm_cleanup: String(!signedOut) }
                : {}),
            };
          }
          if (url.pathname === "/api/dismissed-notifications") return [];
          if (url.pathname === "/api/agent/activity") return { threads: [] };
          if (url.pathname === "/api/agent/thread/latest") {
            return { thread };
          }
          if (url.pathname === "/api/agent/thread/list") {
            return { threads: [], nextCursor: null };
          }
          if (url.pathname.startsWith("/api/agent/thread/")) {
            if (url.pathname.endsWith("/runs")) return { runs: [] };
            return {
              thread,
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
            scenario === "cloud-expiry" &&
            url.pathname === "/api/models/configured"
          ) {
            return [
              {
                id: 1,
                provider: "openai",
                model_id: "whisper-1",
                model_name: "Whisper",
                type: "voice",
                is_default: 1,
              },
              {
                id: 2,
                provider: "freestyle-cloud",
                model_id: "freestyle-cloud/post-process",
                model_name: "Freestyle Cleanup",
                type: "llm",
                is_default: 1,
              },
            ];
          }
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
            if (scenario === "guest-connectors") {
              const apps = [
                {
                  slug: "gmail",
                  name: "Gmail",
                  description: "Search and send email.",
                  authMode: "oauth",
                  connection: null,
                },
                {
                  slug: "github",
                  name: "GitHub",
                  description: "Work with repositories.",
                  authMode: "oauth",
                  connection: null,
                },
                {
                  slug: "posthog",
                  name: "PostHog",
                  description: "Product analytics.",
                  authMode: "api_key",
                  connection: null,
                },
              ];
              const search = url.searchParams.get("search");
              if (search)
                return {
                  connectors: apps.filter((app) =>
                    app.name.toLowerCase().includes(search.toLowerCase()),
                  ),
                  nextCursor: null,
                };
              return url.searchParams.get("cursor")
                ? { connectors: apps.slice(1), nextCursor: null }
                : { connectors: apps.slice(0, 1), nextCursor: "second" };
            }
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
    const staticHeading = STATIC_LOADING_HEADINGS[scenario.id];
    if (staticHeading) {
      await expect(
        dashboard.getByRole("heading", { level: 1, name: staticHeading }),
      ).toBeVisible();
    }
    if (
      scenario.id === "dictionary" ||
      scenario.id === "vocabulary" ||
      scenario.id === "tone"
    ) {
      await expect(
        dashboard.getByLabel(
          scenario.id === "tone" ? "Loading tone settings" : "Loading entries",
        ),
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

test("captures the desktop sidebar hidden and restored", async ({
  browserName,
}, testInfo) => {
  void browserName;
  await dashboard.goto(`${DASHBOARD_URL}?visual=sidebar-toggle#/today`);
  await dashboard
    .locator("html")
    .evaluate((html) => html.classList.add("dark"));
  await expect(dashboard.getByRole("status")).toHaveCount(0, {
    timeout: 5_000,
  });

  const hideSidebar = dashboard.getByRole("button", { name: "Hide sidebar" });
  await expect(hideSidebar).toBeVisible();
  await hideSidebar.click();

  await expect(dashboard.locator(".glass-sidebar")).toHaveCount(0);
  const showSidebar = dashboard.getByRole("button", { name: "Show sidebar" });
  await expect(showSidebar).toBeFocused();
  await expectDashboardWindowButtonPosition({ x: 20, y: 16 });
  const revealBounds = await showSidebar.boundingBox();
  expect(revealBounds).not.toBeNull();
  expect(revealBounds?.x).toBe(process.platform === "darwin" ? 104 : 12);
  expect(revealBounds?.y).toBe(process.platform === "darwin" ? 8 : 12);
  for (const width of [1080, 760]) {
    await app!.evaluate(({ BrowserWindow }, windowWidth) => {
      const panel = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes("index.html"),
      );
      panel?.setSize(windowWidth, 760);
    }, width);

    for (const path of ["/today", "/remix", "/settings/transcription"]) {
      await dashboard.goto(
        `${DASHBOARD_URL}?visual=sidebar-toggle-${width}-${path}#${path}`,
      );
      await dashboard
        .locator("html")
        .evaluate((html) => html.classList.add("dark"));
      await expect(showSidebar).toBeVisible();

      const expectReservedHeader = async () => {
        const bounds = await showSidebar.boundingBox();
        expect(bounds).toEqual(revealBounds);
        const contentBounds = await dashboard
          .locator(".glass-content > main")
          .boundingBox();
        expect(contentBounds).not.toBeNull();
        expect(contentBounds!.y).toBeGreaterThanOrEqual(
          bounds!.y + bounds!.height,
        );
        await expectDashboardWindowButtonPosition({ x: 20, y: 16 });
      };
      // Check before and after lazy route/data loading: neither state should
      // put content underneath the shell's restore button.
      await expectReservedHeader();
      await expect(dashboard.getByRole("status")).toHaveCount(0, {
        timeout: 5_000,
      });
      await expect(showSidebar).toBeVisible();
      await expect(dashboard).toHaveURL(new RegExp(`#${path}$`));
      if (path === "/remix") {
        await expect(
          dashboard.getByText("Ready when you are.", { exact: true }),
        ).toBeVisible();
      }
      await expectReservedHeader();
      const hidden = testInfo.outputPath(
        `sidebar-hidden-${width}-${path.replaceAll("/", "-")}.png`,
      );
      await dashboard.screenshot({ path: hidden });
      await testInfo.attach(`sidebar-hidden-${width}-${path}`, {
        path: hidden,
        contentType: "image/png",
      });
    }
  }

  await app!.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().includes("index.html"))
      ?.setSize(1080, 760);
  });

  await showSidebar.click();
  await expect(dashboard.locator(".glass-sidebar")).toBeVisible();
  await expect(hideSidebar).toBeVisible();
  await expectDashboardWindowButtonPosition({ x: 20, y: 16 });
  const restored = testInfo.outputPath("sidebar-restored.png");
  await dashboard.screenshot({ path: restored });
  await testInfo.attach("sidebar-restored", {
    path: restored,
    contentType: "image/png",
  });
});

test("keeps local navigation after a protected request returns 401", async () => {
  await dashboard.evaluate(() => {
    localStorage.setItem("shell.sidebarVisibility", "hidden");
  });
  await dashboard.goto(`${DASHBOARD_URL}?visual=protected-401#/today`);

  await expect(
    dashboard.getByRole("button", { name: "Show sidebar" }),
  ).toBeVisible();
  await dashboard.getByRole("button", { name: "Show sidebar" }).click();
  await expect(dashboard.locator(".glass-sidebar")).toBeVisible();
  await expect(
    dashboard.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    dashboard.getByRole("button", { name: "Sign in via browser" }),
  ).toBeHidden();
  await expectDashboardWindowButtonPosition({ x: 20, y: 16 });

  const requestedEndpoints = await dashboard.evaluate(() => {
    const visualReviewWindow = window as typeof window & {
      __visualReviewRequests?: string[];
    };
    return visualReviewWindow.__visualReviewRequests ?? [];
  });
  expect(requestedEndpoints).toContain("/api/history");
  // A persistent local 401 must not reset/refetch every active query forever.
  const settingsReads = requestedEndpoints.filter(
    (path) => path === "/api/settings",
  ).length;
  await dashboard.waitForTimeout(750);
  const laterSettingsReads = await dashboard.evaluate(() => {
    const requests =
      (window as typeof window & { __visualReviewRequests?: string[] })
        .__visualReviewRequests ?? [];
    return requests.filter((path) => path === "/api/settings").length;
  });
  expect(laterSettingsReads).toBe(settingsReads);
});

test("lets a first-time guest finish onboarding and set up dictation", async ({
  browserName,
}, testInfo) => {
  void browserName;
  await dashboard.evaluate(() => {
    localStorage.removeItem("visual.guest-onboarding");
    localStorage.setItem("shell.sidebarVisibility", "visible");
  });
  await dashboard.goto(`${DASHBOARD_URL}?visual=guest-first-run#/today`);
  await expect(
    dashboard.getByRole("button", { name: "Continue without an account" }),
  ).toBeVisible();
  const welcome = testInfo.outputPath("guest-onboarding.png");
  await dashboard.screenshot({ path: welcome });
  await testInfo.attach("guest-onboarding", {
    path: welcome,
    contentType: "image/png",
  });
  await dashboard
    .getByRole("button", { name: "Continue without an account" })
    .click();
  await expect(dashboard).toHaveURL(/#\/settings\/models$/);
  await expect(
    dashboard.getByRole("heading", { name: "Models", exact: true }),
  ).toBeVisible();
  await expect(dashboard.locator(".glass-sidebar")).toBeVisible();

  // Completion survives a renderer restart while the user remains signed out.
  await dashboard.goto(`${DASHBOARD_URL}?visual=guest-first-run#/today`);
  await expect(
    dashboard.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    dashboard.getByRole("button", { name: "Continue without an account" }),
  ).toBeHidden();
  await expect(dashboard).toHaveURL(/#\/today$/);
});

test("keeps guest settings available and requests sign-in only inside Remix", async () => {
  await dashboard.goto(
    `${DASHBOARD_URL}?visual=guest-settings#/settings/models`,
  );
  await expect(
    dashboard.getByRole("heading", { name: "Models", exact: true }),
  ).toBeVisible();
  await expect(dashboard.locator(".glass-sidebar")).toBeVisible();
  await dashboard.goto(`${DASHBOARD_URL}?visual=guest-remix#/remix`);
  await expect(
    dashboard.getByText("Sign in to use Remix", { exact: true }),
  ).toBeVisible();
  await expect(dashboard.locator(".glass-sidebar")).toBeVisible();
  await expect(
    dashboard.getByRole("button", { name: "Switch workspace" }),
  ).toBeVisible();
  const sessions = dashboard.getByRole("region", { name: "Remix chats" });
  await expect(
    sessions.getByText("No sessions yet", { exact: true }),
  ).toBeVisible();
  await expect(
    sessions.getByRole("button", { name: "New chat" }),
  ).toBeDisabled();
  await expect(
    sessions.getByRole("button", { name: "Schedules" }),
  ).toBeDisabled();
  await expect(
    dashboard.getByRole("link", { name: /Transcriptions/ }),
  ).toBeHidden();
  await expect(
    dashboard.getByRole("button", { name: "Dismiss sign-in card" }),
  ).toBeHidden();
  await dashboard.evaluate(() => {
    window.location.hash = "#/today";
  });
  await expect(
    dashboard.getByRole("button", { name: "Dismiss sign-in card" }),
  ).toBeVisible();
});

test("shares Settings and Help across workspaces and switches to the signed-in profile", async () => {
  await dashboard.goto(`${DASHBOARD_URL}?visual=guest-sidebar#/remix`);
  const sidebar = dashboard.locator(".glass-sidebar");

  for (const path of ["/remix", "/today"]) {
    await dashboard.evaluate((route) => {
      window.location.hash = `#${route}`;
    }, path);
    await sidebar.getByRole("link", { name: /^Settings/ }).click();
    await expect(dashboard).toHaveURL(/#\/settings(?:\/.*)?$/);
    await sidebar.getByRole("button", { name: "Back to app" }).click();
    await expect(dashboard).toHaveURL(new RegExp(`#${path}$`));
    await sidebar.getByRole("link", { name: /^Help/ }).click();
    await expect(dashboard).toHaveURL(/#\/help$/);
    await expect(
      sidebar.getByRole("link", { name: /^Settings/ }),
    ).toBeVisible();
  }

  // Exercise the device flow without opening an external browser.
  await app.evaluate(({ shell }) => {
    Object.defineProperty(shell, "openExternal", {
      configurable: true,
      value: async () => {},
    });
  });
  await dashboard.evaluate(() => {
    window.location.hash = "#/remix";
  });
  await dashboard.getByRole("button", { name: "Continue in browser" }).click();

  for (const path of ["/remix", "/today"]) {
    await dashboard.evaluate((route) => {
      window.location.hash = `#${route}`;
    }, path);
    await expect(sidebar.getByRole("link", { name: /^Settings/ })).toBeHidden();
    await expect(sidebar.getByRole("link", { name: /^Help/ })).toBeHidden();
    await sidebar.getByRole("button", { name: "Visual review" }).click();
    await dashboard
      .getByRole("menuitem", { name: "Settings", exact: true })
      .click();
    await expect(dashboard).toHaveURL(/#\/settings(?:\/.*)?$/);
    await sidebar.getByRole("button", { name: "Back to app" }).click();
    await expect(dashboard).toHaveURL(new RegExp(`#${path}$`));
    await sidebar.getByRole("button", { name: "Visual review" }).click();
    await dashboard
      .getByRole("menuitem", { name: "Help", exact: true })
      .click();
    await expect(dashboard).toHaveURL(/#\/help$/);
  }

  await dashboard.evaluate(() => {
    window.location.hash = "#/remix";
  });
  await sidebar.getByRole("button", { name: "Visual review" }).click();
  await dashboard.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(sidebar.getByRole("link", { name: /^Settings/ })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /^Help/ })).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Visual review" }),
  ).toBeHidden();
});

for (const mode of ["local", "byok"] as const) {
  test(`lets a guest choose a ${mode} Remix model, chat and restore history`, async ({
    browserName,
  }, testInfo) => {
    void browserName;
    await dashboard.goto(`${DASHBOARD_URL}?visual=guest-remix-${mode}#/remix`);
    await dashboard
      .getByRole("button", { name: "Use a local model or API key" })
      .click();
    const picker = dashboard.getByRole("dialog", {
      name: "Choose a Remix model",
    });
    await expect(picker).toBeVisible();
    if (mode === "local") {
      await picker
        .getByRole("button", { name: "On-device", exact: true })
        .click();
      await picker.getByRole("button", { name: "Test", exact: true }).click();
    }
    await picker
      .locator(".group")
      .filter({ hasText: "Personal chat model" })
      .getByRole("button", {
        name: mode === "local" ? "Use" : "Add key",
        exact: true,
      })
      .click();
    if (mode === "byok") {
      const keyDialog = dashboard.getByRole("dialog");
      await keyDialog
        .getByPlaceholder("sk-…")
        .fill("test-key-not-a-real-secret");
      await keyDialog.getByRole("button", { name: /Save/ }).click();
    }
    await expect(dashboard).toHaveURL(/#\/remix$/);
    // Recover both a failed create (local) and a failed latest-history read
    // (BYOK) without leaving the workspace or asking the guest to sign in.
    await dashboard
      .getByRole("button", { name: "Try again", exact: true })
      .click();
    const composer = dashboard.locator("#panel-composer");
    await expect(composer).toBeVisible();
    const sidebar = dashboard.getByRole("region", { name: "Remix chats" });
    const newChat = sidebar
      .getByRole("button", { name: "New chat", exact: true })
      .and(sidebar.locator(".remix-sidebar-new"));
    await expect(newChat).toBeEnabled();
    await expect(
      sidebar.getByRole("button", { name: "Schedules" }),
    ).toBeDisabled();
    await composer.fill("Say hello");
    await dashboard.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      dashboard.getByText("Hello from Personal chat model.", { exact: true }),
    ).toBeVisible();
    await dashboard.screenshot({
      path: testInfo.outputPath(`guest-remix-${mode}.png`),
    });
    await expect
      .poll(() =>
        dashboard.evaluate(() =>
          (
            window as typeof window & { __visualReviewRequests: string[] }
          ).__visualReviewRequests.some((path) => path.endsWith("/messages")),
        ),
      )
      .toBe(true);
    await dashboard.reload();
    await expect(
      dashboard.getByText("Hello from Personal chat model.", { exact: true }),
    ).toBeVisible();
    await expect(composer).toBeVisible();
    await newChat.click();
    await expect(
      dashboard.getByText("Hello from Personal chat model.", { exact: true }),
    ).toBeHidden();
    await expect(composer).toBeVisible();
    const requests = await dashboard.evaluate(
      () =>
        (window as typeof window & { __visualReviewRequests: string[] })
          .__visualReviewRequests,
    );
    expect(
      requests.some(
        (path) =>
          path.startsWith("/api/agent/") ||
          path.startsWith("/api/connectors") ||
          path.startsWith("/api/suggestions") ||
          path.startsWith("/api/scheduled"),
      ),
    ).toBe(false);
    expect(requests).not.toContain("/api/auth/device/code");
    await composer.fill("Keep this draft across account changes");
    await dashboard.evaluate(async () => {
      // Local chat can be ready before the delayed startup auth check. Let
      // that read settle before simulating the next account reconciliation.
      await fetch("http://127.0.0.1:4649/api/auth/status");
      await fetch("http://127.0.0.1:4649/api/test-sign-in");
      window.dispatchEvent(new Event("focus"));
    });
    const profile = dashboard
      .locator(".glass-sidebar")
      .getByRole("button", { name: "Visual review" });
    await expect(profile).toBeVisible();
    await expect(composer).toHaveValue(
      "Keep this draft across account changes",
    );
    await profile.click();
    await dashboard.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(profile).toBeHidden();
    await expect(composer).toHaveValue(
      "Keep this draft across account changes",
    );
  });
}

test("lets guests browse, paginate and search apps before signing in to connect", async ({
  browserName,
}, testInfo) => {
  void browserName;
  await dashboard.goto(
    `${DASHBOARD_URL}?visual=guest-connectors#/settings/apps`,
  );
  await expect(dashboard.getByText("Gmail", { exact: true })).toBeVisible();
  await dashboard.locator(".connector-load-more").scrollIntoViewIfNeeded();
  await expect(dashboard.getByText("GitHub", { exact: true })).toBeVisible();
  await expect(
    dashboard.getByText("Sign in to Freestyle before connecting an app.", {
      exact: true,
    }),
  ).toBeHidden();
  await dashboard.screenshot({
    path: testInfo.outputPath("guest-connected-apps.png"),
  });
  await dashboard
    .getByRole("textbox", { name: "Search all apps" })
    .fill("PostHog");
  const posthog = dashboard
    .locator(".connector-card")
    .filter({ hasText: "PostHog" });
  await expect(posthog).toBeVisible();
  await posthog.getByRole("button", { name: "Connect", exact: true }).click();
  await expect
    .poll(() =>
      dashboard.evaluate(
        () =>
          (
            window as typeof window & { __visualReviewRequests?: string[] }
          ).__visualReviewRequests?.filter(
            (path) => path === "/api/auth/device/code",
          ).length,
      ),
    )
    .toBe(1);
  await expect(
    dashboard.getByRole("dialog", { name: "Connect PostHog" }),
  ).toBeHidden();
  const requests = await dashboard.evaluate(
    () =>
      (window as typeof window & { __visualReviewRequests?: string[] })
        .__visualReviewRequests ?? [],
  );
  expect(requests).not.toContain("/api/connectors");
  expect(requests).not.toContain("/api/connectors/posthog/connect");
});

test("keeps local settings usable after signing out", async () => {
  await dashboard.goto(`${DASHBOARD_URL}?visual=sign-out#/settings/models`);
  await expect(
    dashboard.getByRole("heading", { name: "Models", exact: true }),
  ).toBeVisible();
  await dashboard.evaluate(() => {
    window.location.hash = "#/today";
  });
  await dashboard.getByRole("button", { name: "Visual review" }).click();
  await dashboard.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(
    dashboard.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await dashboard.evaluate(() => {
    window.location.hash = "#/settings/models";
  });
  await expect(
    dashboard.getByRole("heading", { name: "Models", exact: true }),
  ).toBeVisible();
  await expect(dashboard.locator(".glass-sidebar")).toBeVisible();
  await expect(dashboard).toHaveURL(/#\/settings\/models$/);
});

test("refreshes cleanup state when a session expires while Models is open", async () => {
  await dashboard.goto(`${DASHBOARD_URL}?visual=cloud-expiry#/settings/models`);
  const cleanup = dashboard
    .getByTestId("models-configuration")
    .getByRole("switch");
  await expect(cleanup).toBeChecked();
  await expect(dashboard.getByLabel("Loading profile")).toBeHidden();
  await dashboard.evaluate(async () => {
    await fetch("http://127.0.0.1:4649/api/test-expiry");
    window.dispatchEvent(new Event("focus"));
  });
  await expect(cleanup).not.toBeChecked();
  await expect(
    dashboard.getByRole("heading", { name: "Models", exact: true }),
  ).toBeVisible();
  await expect(dashboard.locator(".glass-sidebar")).toBeVisible();
});
