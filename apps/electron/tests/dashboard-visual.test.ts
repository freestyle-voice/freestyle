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
        __visualReviewHistoryQueries?: string[];
        __holdLocalReply?: boolean;
        __releaseLocalReply?: () => void;
        __holdLocalCreate?: boolean;
        __releaseLocalCreate?: () => void;
        __holdLocalDetail?: boolean;
        __releaseLocalDetail?: () => void;
      };
      visualReviewWindow.__visualReviewErrors = [];
      visualReviewWindow.__visualReviewRequests = [];
      visualReviewWindow.__visualReviewHistoryQueries = [];
      const originalFetch = window.fetch.bind(window);
      let signedOut = false;
      const scenario = new URLSearchParams(window.location.search).get(
        "visual",
      );
      const pluginLayoutScenario = scenario?.startsWith("guest-plugin-layout-");
      if (scenario === "guest-history-filters") {
        localStorage.setItem("today.heroDismissed", "1");
        localStorage.setItem("today.statsOpen", "1");
        localStorage.removeItem("history.filters");
      }
      let releasePluginData: () => void = () => {};
      const pluginDataReady = new Promise<void>((resolve) => {
        releasePluginData = resolve;
      });
      if (pluginLayoutScenario) {
        localStorage.setItem(
          "plugins.activeTab",
          scenario!.endsWith("installed") ? "installed" : "browse",
        );
        (
          window as typeof window & { __releasePluginData?: () => void }
        ).__releasePluginData = releasePluginData;
      }
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
          scenario === "guest-remix-local" ||
          scenario === "guest-remix-byok" ||
          scenario === "guest-remix-race";
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
            if (visualReviewWindow.__holdLocalCreate) {
              await new Promise<void>((resolve) => {
                visualReviewWindow.__releaseLocalCreate = resolve;
              });
              visualReviewWindow.__holdLocalCreate = false;
            }
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
              if (visualReviewWindow.__holdLocalReply) {
                await new Promise<void>((resolve) => {
                  visualReviewWindow.__releaseLocalReply = resolve;
                });
                visualReviewWindow.__holdLocalReply = false;
              }
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
            if (visualReviewWindow.__holdLocalDetail) {
              await new Promise<void>((resolve) => {
                visualReviewWindow.__releaseLocalDetail = resolve;
              });
              visualReviewWindow.__holdLocalDetail = false;
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
          if (pluginLayoutScenario && url.pathname === "/api/plugins") {
            return {
              plugins: scenario!.endsWith("installed")
                ? Array.from({ length: 3 }, (_, index) => ({
                    name: `fixture-plugin-${index}`,
                    displayName: `Fixture plugin ${index + 1}`,
                    slug: `fixture-plugin-${index}`,
                    specifier: `fixture-plugin-${index}`,
                    enabled: true,
                    version: "1.0.0",
                    description: "A plugin for testing the loading layout.",
                    pages: [],
                  }))
                : [],
            };
          }
          if (url.pathname === "/api/plugins") return { plugins: [] };
          if (url.pathname === "/api/plugins/catalog") {
            return {
              plugins: pluginLayoutScenario
                ? Array.from({ length: 3 }, (_, index) => ({
                    npmName: `fixture-plugin-${index}`,
                    title: `Fixture plugin ${index + 1}`,
                    description: "A plugin for testing the loading layout.",
                    author: "Freestyle",
                  }))
                : [],
            };
          }
          if (url.pathname === "/api/plugins/check-updates")
            return { updates: [] };
          if (url.pathname === "/api/auth/status") {
            if (guest || signedOut)
              return { authenticated: false, user: null, verified: true };
            return {
              authenticated: true,
              user: fixtureUser,
              verified: true,
            };
          }
          if (url.pathname === "/api/history") {
            if (scenario === "guest-history-filters") {
              visualReviewWindow.__visualReviewHistoryQueries!.push(url.search);
              const search = url.searchParams.get("search") ?? "";
              const items = Array.from({ length: 40 }, (_, index) => ({
                id: index + 1,
                raw_text: `Raw note ${index + 1}`,
                cleaned_text: `Edited note ${index + 1}`,
                voice_provider: "openai",
                voice_model: "whisper-1",
                llm_provider: "openai",
                llm_model: "gpt-4o-mini",
                duration_ms: 650,
                audio_duration_ms: 3200,
                input_tokens: 18,
                output_tokens: 12,
                cost_usd: 0,
                created_at: "2026-10-08 10:00:00",
              })).filter((item) => item.raw_text.includes(search));
              const offset = Number(url.searchParams.get("offset") ?? 0);
              return {
                items: items.slice(offset, offset + 20),
                total: items.length,
              };
            }
            return { items: [], total: 0 };
          }
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
              unfiltered_total_sessions:
                scenario === "guest-history-filters" ? 40 : 0,
            };
          }
          if (url.pathname === "/api/history/daily") return { days: [] };
          if (url.pathname === "/api/settings") {
            if (
              (scenario === "guest-first-run" ||
                scenario === "signed-in-first-run") &&
              !localStorage.getItem("visual.guest-onboarding")
            )
              return {};
            return {
              onboarding: JSON.stringify({ v: 2, done: true }),
              ...(scenario === "cloud-expiry" ||
              scenario === "guest-models-cloud"
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
            if (scenario === "signed-in-onboarded-offline")
              return new Promise<never>(() => {});
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
            (scenario === "cloud-expiry" ||
              scenario === "guest-models-cloud") &&
            url.pathname === "/api/models/configured"
          ) {
            return [
              {
                id: 1,
                provider:
                  scenario === "guest-models-cloud"
                    ? "freestyle-cloud"
                    : "openai",
                model_id:
                  scenario === "guest-models-cloud"
                    ? "freestyle-cloud/transcribe"
                    : "whisper-1",
                model_name:
                  scenario === "guest-models-cloud"
                    ? "Freestyle Transcribe"
                    : "Whisper",
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
            url.pathname === "/api/brain/notes"
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

        if (pluginLayoutScenario && url.pathname.startsWith("/api/plugins"))
          await pluginDataReady;
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

test("fills the history height and resizes the feed with both sidebar slides", async () => {
  await dashboard.goto(`${DASHBOARD_URL}?visual=guest-history-filters#/today`);
  await expect(
    dashboard.getByText("“Edited note 1”", { exact: true }),
  ).toBeVisible();
  await dashboard.getByRole("button", { name: "Hide stats" }).click();
  const layout = dashboard.getByTestId("history-layout");
  await expect(layout).toHaveCSS("grid-template-columns", / 0px$/);
  const layoutBounds = await layout.boundingBox();
  const mainBounds = await dashboard.locator("main").boundingBox();
  expect(layoutBounds!.y).toBeCloseTo(mainBounds!.y, 0);
  expect(layoutBounds!.height).toBeCloseTo(mainBounds!.height, 0);

  // Pause real browser transitions and sample their geometry. This catches a
  // feed that jumps to its final width before an independent sheet animation.
  const sampleMotion = async (opening: boolean, panel: "filters" | "stats") =>
    dashboard.evaluate(
      async ({ open, panel }) => {
        const layout = document.querySelector<HTMLElement>(
          '[data-testid="history-layout"]',
        )!;
        const feed = document.querySelector<HTMLElement>(
          '[data-testid="history-feed"]',
        )!;
        const rail = document.querySelector<HTMLElement>(
          '[data-testid="history-sidebar-rail"]',
        )!;
        const initialWidth = feed.getBoundingClientRect().width;
        const button = open
          ? document.querySelector<HTMLButtonElement>(
              `[role="radio"][aria-label="${panel === "filters" ? "Filters" : "Stats"}"]`,
            )
          : document.querySelector<HTMLButtonElement>(
              `[aria-label="${panel === "filters" ? "Close filters" : "Hide stats"}"]`,
            );
        button!.click();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const content = document.querySelector<HTMLElement>(
          '[data-slot="sheet-content"]',
        )!;
        const transitions = document.getAnimations().filter((animation) => {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          return target === layout || target === feed || target === content;
        });
        const layoutTransition = transitions.find(
          (animation) =>
            animation instanceof CSSTransition &&
            animation.transitionProperty === "grid-template-columns",
        );
        if (!layoutTransition)
          throw new Error("History layout did not animate");
        for (const animation of transitions) animation.pause();
        const duration = Number(layoutTransition.effect!.getTiming().duration);
        const samples = [0, duration / 2, duration].map((time) => {
          for (const animation of transitions) animation.currentTime = time;
          const content = document.querySelector<HTMLElement>(
            '[data-slot="sheet-content"]',
          )!;
          return {
            feed: feed.getBoundingClientRect().toJSON(),
            rail: rail.getBoundingClientRect().toJSON(),
            panel: content.getBoundingClientRect().toJSON(),
            layout: layout.getBoundingClientRect().toJSON(),
          };
        });
        for (const animation of transitions) animation.finish();
        return { initialWidth, samples };
      },
      { open: opening, panel },
    );

  for (const panel of ["filters", "stats"] as const) {
    const opened = await sampleMotion(true, panel);
    expect(opened.samples[0].feed.width).toBeCloseTo(opened.initialWidth, 0);
    expect(opened.samples[0].rail.width).toBeCloseTo(0, 0);
    expect(opened.samples[1].feed.width).toBeLessThan(opened.initialWidth);
    expect(opened.samples[1].feed.width).toBeGreaterThan(
      opened.samples[2].feed.width,
    );
    for (const sample of opened.samples) {
      expect(sample.feed.right).toBeCloseTo(sample.rail.left, 0);
      expect(sample.panel.top).toBeCloseTo(sample.layout.top, 0);
      expect(sample.panel.bottom).toBeCloseTo(sample.layout.bottom, 0);
      expect(sample.panel.left).toBeCloseTo(sample.rail.left, 0);
    }

    const closed = await sampleMotion(false, panel);
    expect(closed.samples[0].feed.width).toBeCloseTo(closed.initialWidth, 0);
    expect(closed.samples[1].feed.width).toBeGreaterThan(closed.initialWidth);
    expect(closed.samples[1].feed.width).toBeLessThan(
      closed.samples[2].feed.width,
    );
    expect(closed.samples[2].rail.width).toBeCloseTo(0, 0);
    await expect(
      dashboard.getByRole("dialog", {
        name: panel === "filters" ? "Filter" : "Stats",
        exact: true,
      }),
    ).toBeHidden();
  }
  await dashboard.getByRole("radio", { name: "Stats", exact: true }).click();
  await expect(
    dashboard.getByRole("button", { name: "Hide stats" }),
  ).toBeVisible();
});

test("switches history sidebars from grouped icon controls and resizes stats immediately", async ({
  browserName,
}, testInfo) => {
  void browserName;
  await dashboard.goto(`${DASHBOARD_URL}?visual=guest-history-filters#/today`);
  await expect(
    dashboard.getByText("“Edited note 1”", { exact: true }),
  ).toBeVisible();
  const controls = dashboard.getByRole("radiogroup", {
    name: "History panels",
  });
  const filters = controls.getByRole("radio", { name: "Filters", exact: true });
  const stats = controls.getByRole("radio", { name: "Stats", exact: true });
  await expect(controls.getByRole("radio")).toHaveCount(2);
  await expect(stats).toBeChecked();
  await expect(stats).toHaveAttribute("data-state", "on");
  await filters.click();
  await expect(filters).toBeChecked();
  await expect(stats).not.toBeChecked();
  await expect(
    dashboard.getByRole("dialog", { name: "Filter", exact: true }),
  ).toBeVisible();
  await dashboard.screenshot({
    path: testInfo.outputPath("history-filter-controls.png"),
    animations: "disabled",
  });
  await stats.click();
  await expect(stats).toBeChecked();
  await expect(filters).not.toBeChecked();
  const panel = dashboard.getByRole("dialog", { name: "Stats", exact: true });
  await expect(panel).toBeVisible();
  await expect(stats).toBeFocused();
  const viewportWidth = await dashboard.evaluate(() => window.innerWidth);
  await expect
    .poll(() =>
      panel.evaluate((element) =>
        Math.round(element.getBoundingClientRect().right),
      ),
    )
    .toBe(viewportWidth);
  await expect(panel.getByRole("button", { name: "Hide stats" })).toBeVisible();
  await dashboard.screenshot({
    path: testInfo.outputPath("history-stats-controls.png"),
    animations: "disabled",
  });
  const resize = panel.getByRole("separator", { name: "Resize stats panel" });
  const width = Number(await resize.getAttribute("aria-valuenow"));
  await resize.focus();
  await dashboard.keyboard.press("ArrowLeft");
  await expect(resize).toHaveAttribute("aria-valuenow", String(width + 16));
  await expect(dashboard.getByTestId("history-layout")).toHaveCSS(
    "grid-template-columns",
    new RegExp(` ${width + 16}px$`),
  );
  expect(
    await dashboard
      .getByTestId("history-layout")
      .evaluate((layout) =>
        layout
          .getAnimations()
          .some(
            (animation) =>
              animation instanceof CSSTransition &&
              animation.transitionProperty === "grid-template-columns",
          ),
      ),
  ).toBe(false);
  await dashboard.keyboard.press("ArrowRight");
  await expect(resize).toHaveAttribute("aria-valuenow", String(width));
  await expect(dashboard.getByTestId("history-layout")).toHaveAttribute(
    "data-resizing",
    "false",
  );
  await expect(dashboard.getByTestId("history-layout")).toHaveCSS(
    "grid-template-columns",
    new RegExp(` ${width}px$`),
  );
  const resizeBounds = await resize.boundingBox();
  await dashboard.mouse.move(
    resizeBounds!.x + resizeBounds!.width - 1,
    resizeBounds!.y + 30,
  );
  await dashboard.mouse.down();
  await expect(dashboard.getByTestId("history-layout")).toHaveAttribute(
    "data-resizing",
    "true",
  );
  await dashboard.mouse.move(viewportWidth - width - 32, resizeBounds!.y + 30);
  await expect(resize).toHaveAttribute("aria-valuenow", String(width + 32));
  await expect(dashboard.getByTestId("history-layout")).toHaveCSS(
    "grid-template-columns",
    new RegExp(` ${width + 32}px$`),
  );
  await expect(dashboard.getByTestId("history-layout")).toHaveAttribute(
    "data-resizing",
    "true",
  );
  // Closing during a captured pointer drag must not leave future slides in
  // resize mode after the handle unmounts.
  await dashboard.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await dashboard.mouse.up();
  await expect(dashboard.getByTestId("history-layout")).toHaveAttribute(
    "data-resizing",
    "false",
  );
  await stats.click();
  await expect(panel).toBeVisible();
  await expect(dashboard.getByTestId("history-layout")).toHaveAttribute(
    "data-resizing",
    "false",
  );
  await stats.click();
  await expect(panel).toBeHidden();
  await expect(stats).not.toBeChecked();
  await stats.click();
  await expect(panel).toBeVisible();
});

test("applies history date presets through the live calendar range", async () => {
  await dashboard.clock.setFixedTime(new Date(2026, 9, 9, 12));
  await dashboard.goto(`${DASHBOARD_URL}?visual=guest-history-filters#/today`);
  await expect(
    dashboard.getByText("“Edited note 1”", { exact: true }),
  ).toBeVisible();
  await dashboard.getByRole("button", { name: "Next page" }).click();
  await expect(dashboard.getByText("1 / 2", { exact: true })).toBeHidden();
  await dashboard.getByRole("radio", { name: "Filters", exact: true }).click();
  const panel = dashboard.getByRole("dialog", { name: "Filter", exact: true });
  const presets = panel.getByRole("group", { name: "Date presets" });
  for (const [label, start, formattedStart] of [
    ["Today", "2026-10-09", "9 Oct, 2026"],
    ["Last 3 days", "2026-10-07", "7 Oct, 2026"],
    ["Last Week", "2026-10-03", "3 Oct, 2026"],
    ["Last Month", "2026-09-10", "10 Sep, 2026"],
  ]) {
    const button = presets.getByRole("button", { name: label, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(presets.locator('[aria-pressed="true"]')).toHaveCount(1);
    await expect(
      panel.getByRole("button", { name: `${formattedStart} - 9 Oct, 2026` }),
    ).toBeVisible();
    await expect
      .poll(() =>
        dashboard.evaluate(() => {
          const queries = (
            window as typeof window & {
              __visualReviewHistoryQueries?: string[];
            }
          ).__visualReviewHistoryQueries;
          const query = new URLSearchParams(queries?.at(-1));
          return [
            query.get("start_date"),
            query.get("end_date"),
            query.get("offset"),
          ];
        }),
      )
      .toEqual([start, "2026-10-09", "0"]);
    await expect(panel).toBeVisible();
  }
  await panel.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(presets.locator('[aria-pressed="true"]')).toHaveCount(0);
  await panel.getByRole("button", { name: "Close filters" }).click();
  await dashboard.clock.setSystemTime(new Date());
});

test("keeps history interactive while live filters are open in the right rail", async ({
  browserName,
}, testInfo) => {
  void browserName;
  await dashboard.goto(`${DASHBOARD_URL}?visual=guest-history-filters#/today`);
  const filters = dashboard.getByRole("radio", {
    name: "Filters",
    exact: true,
  });
  const search = dashboard.getByPlaceholder(/Search.*transcript/i);
  await expect(
    dashboard.getByText("“Edited note 1”", { exact: true }),
  ).toBeVisible();
  await filters.click();
  const panel = dashboard.getByRole("dialog", { name: "Filter", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute("aria-modal", "true");
  await panel.getByRole("switch", { name: "Diff mode" }).click();
  await expect(dashboard.locator("del").first()).toBeVisible();
  await expect(panel.getByRole("switch", { name: "AI edits" })).toBeDisabled();
  await panel.getByRole("switch", { name: "Diff mode" }).click();
  await panel.getByRole("switch", { name: "AI edits" }).click();
  await expect(
    dashboard.getByText("“Raw note 1”", { exact: true }),
  ).toBeVisible();
  await search.fill("note 2");
  await expect(search).toBeFocused();
  await expect(
    dashboard.getByText("“Raw note 2”", { exact: true }),
  ).toBeVisible();
  await expect(panel).toBeVisible();
  await search.fill("");
  await dashboard.getByRole("button", { name: "Next page" }).click();
  await expect(
    dashboard.getByText("“Raw note 21”", { exact: true }),
  ).toBeVisible();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Select - Select" }).click();
  await expect(dashboard.getByRole("grid").first()).toBeVisible();
  await dashboard
    .getByRole("grid")
    .first()
    .locator("button")
    .filter({ hasText: /^7$/ })
    .click();
  await dashboard.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Clear" }).click();
  for (const width of [1080, 760]) {
    await app!.evaluate(({ BrowserWindow }, nextWidth) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes("index.html"))
        ?.setSize(nextWidth, 760);
    }, width);
    await expect
      .poll(() => dashboard.evaluate(() => window.innerWidth))
      .toBe(width);
    const panelBounds = await panel.boundingBox();
    const searchBounds = await search.boundingBox();
    expect(searchBounds!.x + searchBounds!.width).toBeLessThanOrEqual(
      panelBounds!.x,
    );
    for (const theme of ["light", "dark"]) {
      await dashboard
        .locator("html")
        .evaluate(
          (html, value) => html.classList.toggle("dark", value === "dark"),
          theme,
        );
      await dashboard.screenshot({
        path: testInfo.outputPath(`history-filters-${width}-${theme}.png`),
        animations: "disabled",
      });
    }
  }
  await panel.getByRole("button", { name: "Close filters" }).focus();
  await dashboard.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(filters).toBeFocused();
  await expect(
    dashboard.getByRole("button", { name: "Hide stats" }),
  ).toBeVisible();
  await dashboard.emulateMedia({ reducedMotion: "reduce" });
  await filters.click();
  await expect(panel).toHaveCSS("animation-name", "none");
  await expect(dashboard.getByTestId("history-layout")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await expect(
    panel.getByRole("switch", { name: "AI edits" }),
  ).not.toBeChecked();
  await panel.getByRole("button", { name: "Close filters" }).click();
  await expect(panel).toBeHidden();
  await expect(
    dashboard.getByRole("dialog", { name: "Stats", exact: true }),
  ).toHaveCSS("animation-name", "none");
  await dashboard.emulateMedia({ reducedMotion: "no-preference" });
  await app!.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().includes("index.html"))
      ?.setSize(1080, 760);
  });
});

test("keeps Plugins toolbar and row geometry stable as Browse and Installed finish loading", async ({
  browserName,
}, testInfo) => {
  void browserName;
  for (const tab of ["browse", "installed"]) {
    await dashboard.goto(
      `${DASHBOARD_URL}?visual=guest-plugin-layout-${tab}#/plugins`,
    );
    const loading = dashboard.getByRole("status", {
      name: "Loading plugins",
      exact: true,
    });
    await expect(loading).toBeVisible();
    const search = dashboard.getByRole("textbox", {
      name: "Search plugins…",
      exact: true,
    });
    await expect(search).toBeVisible();
    const beforeSearch = await search.boundingBox();
    const beforeRow = await loading
      .locator(":scope > div")
      .first()
      .boundingBox();
    await dashboard.screenshot({
      path: testInfo.outputPath(`plugins-${tab}-loading.png`),
    });
    await dashboard.evaluate(() => {
      (
        window as typeof window & { __releasePluginData?: () => void }
      ).__releasePluginData?.();
    });
    await expect(loading).toBeHidden();
    await expect(
      dashboard.getByText("Fixture plugin 1", { exact: true }),
    ).toBeVisible();
    const rows = dashboard
      .locator(".responsive-page-scroll > div")
      .last()
      .locator(":scope > div");
    await expect(rows).toHaveCount(3);
    const afterRow = await rows.first().boundingBox();
    const afterSearch = await search.boundingBox();
    for (const coordinate of ["x", "y", "width", "height"] as const) {
      expect(
        Math.abs(beforeRow![coordinate] - afterRow![coordinate]),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(beforeSearch![coordinate] - afterSearch![coordinate]),
      ).toBeLessThanOrEqual(1);
    }
    await expect(
      dashboard.getByRole("button", {
        name: tab === "browse" ? "Install" : "More options",
        exact: true,
      }),
    ).toHaveCount(3);
    await dashboard.screenshot({
      path: testInfo.outputPath(`plugins-${tab}-loaded.png`),
    });
  }
  await dashboard.evaluate(() => localStorage.removeItem("plugins.activeTab"));
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

test("completes signed-in onboarding and restores its local save without Cloud history", async () => {
  await dashboard.evaluate(() => {
    localStorage.removeItem("visual.guest-onboarding");
  });
  await dashboard.goto(`${DASHBOARD_URL}?visual=signed-in-first-run#/today`);
  const continueButton = dashboard.getByRole("button", {
    name: "Continue to Freestyle",
  });
  await expect(continueButton).toBeVisible();
  await expect(
    dashboard.getByRole("button", { name: "Continue without an account" }),
  ).toBeHidden();
  await continueButton.click();
  await expect(dashboard).toHaveURL(/#\/today$/);
  await expect(continueButton).toBeHidden();

  // Even a permanently unavailable Cloud history endpoint cannot reopen or
  // stall onboarding when the installation already has a completed save.
  await dashboard.goto(
    `${DASHBOARD_URL}?visual=signed-in-onboarded-offline#/settings/models`,
  );
  await expect(
    dashboard.getByRole("heading", { name: "Models", exact: true }),
  ).toBeVisible();
  await expect(dashboard).toHaveURL(/#\/settings\/models$/);
  await dashboard.getByRole("button", { name: "Back to app" }).click();
  await expect(
    dashboard.locator(".glass-sidebar").getByRole("button", {
      name: "Visual review",
    }),
  ).toBeVisible();
  expect(
    await dashboard.evaluate(
      () =>
        (window as typeof window & { __visualReviewRequests: string[] })
          .__visualReviewRequests,
    ),
  ).not.toContain("/api/agent/thread/list");
});

test("guides guests to Remix model setup and keeps workspace sign-in cards above the footer", async ({
  browserName,
}, testInfo) => {
  void browserName;
  await dashboard.goto(
    `${DASHBOARD_URL}?visual=guest-settings#/settings/models`,
  );
  await expect(
    dashboard.getByRole("heading", { name: "Models", exact: true }),
  ).toBeVisible();
  await expect(dashboard.locator(".glass-sidebar")).toBeVisible();
  await dashboard.goto(`${DASHBOARD_URL}?visual=guest-remix#/remix`);
  await expect(
    dashboard.getByRole("heading", {
      name: "Set up your Remix model",
      exact: true,
    }),
  ).toBeVisible();
  await expect(dashboard.locator(".glass-sidebar")).toBeVisible();
  await expect(
    dashboard.getByRole("button", { name: "Switch workspace" }),
  ).toBeVisible();
  const sessions = dashboard.getByRole("region", { name: "Remix chats" });
  const chat = dashboard.getByRole("region", {
    name: "Remix chat",
    exact: true,
  });
  await expect(
    chat.getByRole("heading", { name: "New chat", exact: true }),
  ).toBeVisible();
  await expect(
    chat.getByRole("textbox", { name: "Message Remix" }),
  ).toBeDisabled();
  await expect(
    chat.getByRole("textbox", { name: "Message Remix" }),
  ).toHaveAttribute("placeholder", "Choose a Remix model to start chatting…");
  await expect(
    chat.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
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
  const remixCard = dashboard.getByRole("region", {
    name: "Freestyle Remix",
    exact: true,
  });
  await expect(remixCard).toBeVisible();
  await expect(
    remixCard.getByText(
      "Sign in for Cloud models, synced chats, and scheduled tasks.",
    ),
  ).toBeVisible();
  await expect(
    sessions.getByText("Choose your Remix model to start a chat."),
  ).toBeVisible();
  const cardBounds = await remixCard.boundingBox();
  const settingsBounds = await dashboard
    .getByRole("link", { name: /^Settings/ })
    .boundingBox();
  expect(cardBounds!.y + cardBounds!.height).toBeLessThan(settingsBounds!.y);
  await dashboard.screenshot({
    path: testInfo.outputPath("remix-model-setup.png"),
  });
  await remixCard.getByRole("button", { name: "Dismiss sign-in card" }).click();
  await expect(remixCard).toBeHidden();
  await dashboard.evaluate(() => {
    window.location.hash = "#/today";
  });
  await expect(
    dashboard.getByRole("button", { name: "Dismiss sign-in card" }),
  ).toBeVisible();
  await expect(
    dashboard.getByRole("region", {
      name: "Freestyle Transcribe",
      exact: true,
    }),
  ).toBeVisible();
  await dashboard.evaluate(() => {
    window.location.hash = "#/remix";
  });
  await expect(remixCard).toBeHidden();
  await dashboard.reload();
  await expect(remixCard).toBeVisible();
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
  await sidebar.getByRole("button", { name: "Sign in", exact: true }).click();

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
      .getByRole("button", { name: "Choose a Remix model", exact: true })
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
    await dashboard.evaluate(() => {
      (
        window as typeof window & { __holdLocalReply?: boolean }
      ).__holdLocalReply = true;
    });
    await composer.fill("Say hello");
    await dashboard.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      dashboard.getByRole("button", { name: "Stop generating" }),
    ).toBeVisible();
    await composer.fill("Keep my next message while this reply is running");
    await expect(
      dashboard.getByRole("button", { name: "Send", exact: true }),
    ).toBeDisabled();
    await composer.press("Enter");
    await expect(composer).toHaveValue(
      "Keep my next message while this reply is running",
    );
    await expect
      .poll(() =>
        dashboard.evaluate(
          () =>
            typeof (
              window as typeof window & { __releaseLocalReply?: () => void }
            ).__releaseLocalReply,
        ),
      )
      .toBe("function");
    await dashboard.evaluate(() => {
      (
        window as typeof window & { __releaseLocalReply?: () => void }
      ).__releaseLocalReply?.();
    });
    await expect(
      dashboard.getByText("Hello from Personal chat model.", { exact: true }),
    ).toBeVisible();
    await expect(composer).toHaveValue(
      "Keep my next message while this reply is running",
    );
    await expect(
      dashboard.getByRole("button", { name: "Send", exact: true }),
    ).toBeEnabled();
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
    // Settings navigation unmounts the chat. The completed transcript must
    // survive before a document reload fetches persisted history.
    await dashboard
      .locator(".glass-sidebar")
      .getByRole("link", {
        name: /^Settings/,
      })
      .click();
    await expect(dashboard).toHaveURL(/#\/settings\/transcription$/);
    await dashboard.getByRole("button", { name: "Back to app" }).click();
    await expect(dashboard).toHaveURL(/#\/remix$/);
    await expect(
      dashboard.getByText("Hello from Personal chat model.", {
        exact: true,
      }),
    ).toBeVisible();
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

test("keeps a selected local conversation loading when an older create finishes", async () => {
  await dashboard.evaluate(() => {
    const model = {
      provider: "local-llm",
      model_id: "local-llm/Personal chat model",
      model_name: "Personal chat model",
      type: "remix",
      is_default: 1,
    };
    localStorage.setItem("guest-remix-race:model", JSON.stringify(model));
    localStorage.setItem(
      "guest-remix-race:history",
      JSON.stringify(
        ["First conversation", "Second conversation"].map((title) => ({
          id: crypto.randomUUID(),
          type: "local",
          title,
          model: {
            provider: model.provider,
            modelId: model.model_id,
            modelName: model.model_name,
          },
          messages: [
            {
              id: crypto.randomUUID(),
              role: "user",
              parts: [{ type: "text", text: title }],
            },
          ],
          lastActiveAt: "2026-10-09 00:00:00",
        })),
      ),
    );
  });
  await dashboard.goto(`${DASHBOARD_URL}?visual=guest-remix-race#/remix`);
  const composer = dashboard.locator("#panel-composer");
  await expect(composer).toBeEnabled();
  await dashboard.evaluate(() => {
    const fixture = window as typeof window & {
      __holdLocalCreate?: boolean;
      __holdLocalDetail?: boolean;
    };
    fixture.__holdLocalCreate = true;
    fixture.__holdLocalDetail = true;
  });
  const sidebar = dashboard.getByRole("region", { name: "Remix chats" });
  await sidebar.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(composer).toBeDisabled();
  await sidebar
    .getByRole("button", { name: "Second conversation", exact: true })
    .click();
  await expect(composer).toHaveAttribute(
    "placeholder",
    "Loading conversation…",
  );
  await expect
    .poll(() =>
      dashboard.evaluate(
        () =>
          typeof (
            window as typeof window & { __releaseLocalCreate?: () => void }
          ).__releaseLocalCreate,
      ),
    )
    .toBe("function");
  await dashboard.evaluate(() => {
    (
      window as typeof window & { __releaseLocalCreate?: () => void }
    ).__releaseLocalCreate?.();
  });
  await expect
    .poll(() =>
      dashboard.evaluate(
        () =>
          (window as typeof window & { __holdLocalCreate?: boolean })
            .__holdLocalCreate,
      ),
    )
    .toBe(false);
  await expect(composer).toBeDisabled();
  await expect(composer).toHaveAttribute(
    "placeholder",
    "Loading conversation…",
  );
  await expect
    .poll(() =>
      dashboard.evaluate(
        () =>
          typeof (
            window as typeof window & { __releaseLocalDetail?: () => void }
          ).__releaseLocalDetail,
      ),
    )
    .toBe("function");
  await dashboard.evaluate(() => {
    (
      window as typeof window & { __releaseLocalDetail?: () => void }
    ).__releaseLocalDetail?.();
  });
  await expect(composer).toBeEnabled();
  await expect(
    dashboard.locator(".tavern-msg").getByText("Second conversation", {
      exact: true,
    }),
  ).toBeVisible();
});

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

test("keeps the compact model overview usable with Cloud, local setup and collapsed API keys", async ({
  browserName,
}, testInfo) => {
  void browserName;
  await dashboard.goto(
    `${DASHBOARD_URL}?visual=guest-models-cloud#/settings/models`,
  );
  const overview = dashboard.getByTestId("models-settings-page");
  await expect(
    overview.getByText("Freestyle Transcribe", { exact: true }),
  ).toBeVisible();
  await expect(
    overview.getByText("Freestyle Cleanup", { exact: true }),
  ).toBeVisible();
  await expect(overview.getByText("Included", { exact: true })).toBeVisible();
  await expect(overview.getByRole("switch")).toHaveCount(0);
  await expect(
    overview.getByText("One service for transcription and cleanup", {
      exact: true,
    }),
  ).toHaveCount(0);
  const keys = overview.getByTestId("models-api-keys");
  await expect(keys).not.toHaveAttribute("open");
  await keys.locator("summary").focus();
  await dashboard.keyboard.press("Enter");
  await expect(keys).toHaveAttribute("open", "");
  await expect(
    keys.getByText(
      "Keys are only requested when the model you choose needs one.",
    ),
  ).toBeVisible();
  await dashboard.keyboard.press("Enter");
  await expect(keys).not.toHaveAttribute("open");
  for (const theme of ["light", "dark"]) {
    await dashboard
      .locator("html")
      .evaluate(
        (html, value) => html.classList.toggle("dark", value === "dark"),
        theme,
      );
    await dashboard.screenshot({
      path: testInfo.outputPath(`models-overview-${theme}.png`),
      animations: "disabled",
    });
  }
  await app!.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().includes("index.html"))
      ?.setSize(760, 760);
  });
  await expect
    .poll(() => dashboard.evaluate(() => window.innerWidth))
    .toBe(760);
  await expect(
    overview.getByRole("button", { name: "Sign in", exact: true }),
  ).toHaveCSS("color", "rgb(236, 231, 214)");
  const rows = overview.getByTestId("models-configuration");
  const labelBounds = await rows
    .getByRole("heading", { name: "Transcription", exact: true })
    .boundingBox();
  const modelBounds = await rows
    .getByText("Freestyle Transcribe", { exact: true })
    .boundingBox();
  expect(modelBounds!.y).toBeGreaterThan(labelBounds!.y);
  await dashboard.screenshot({
    path: testInfo.outputPath("models-overview-narrow.png"),
    animations: "disabled",
  });
  await app!.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().includes("index.html"))
      ?.setSize(1080, 760);
  });
  await overview
    .getByRole("button", { name: "Change voice transcription model" })
    .click();
  await expect(dashboard.getByRole("dialog")).toBeVisible();
  await dashboard
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await overview
    .getByTestId("remix-model-configuration")
    .getByRole("button", { name: "Choose a model" })
    .click();
  await expect(
    dashboard.getByRole("dialog").getByText("Freestyle Cloud", { exact: true }),
  ).toBeVisible();
  await dashboard
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
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
