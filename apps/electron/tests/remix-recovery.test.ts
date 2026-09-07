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

type Fixture = {
  offline: boolean;
  status: string;
  calls: Array<{ path: string; body?: Record<string, unknown> }>;
};
type FixtureWindow = Window & { __remixRecovery: Fixture };
let app: ElectronApplication;
let pill: Page;
let workspace: Page;

async function installFixtures(page: Page) {
  await page.addInitScript(() => {
    if (!location.search.includes("recovery-resume")) localStorage.clear();
    const f: Fixture = { offline: false, status: "running", calls: [] };
    (window as unknown as FixtureWindow).__remixRecovery = f;
    let messages: unknown[] = [];
    let threadId = "";
    let clientRequestId = "";
    let queue: Array<{ id: string; text: string; createdAt: number }> = [];
    const save = () =>
      localStorage.setItem(
        "e2e.remix.backend",
        JSON.stringify({
          messages,
          threadId,
          clientRequestId,
          queue,
          status: f.status,
        }),
      );
    const turnId = "00000000-0000-4000-8000-000000000001";
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const path = new URL(
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input.href,
      ).pathname;
      if (!path.startsWith("/api/")) return original(input, init);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      f.calls.push({ path, body });
      const stored = localStorage.getItem("e2e.remix.backend");
      if (stored) {
        const backend = JSON.parse(stored);
        if (!threadId) f.status = backend.status;
        messages = backend.messages;
        threadId = backend.threadId;
        clientRequestId = backend.clientRequestId;
        queue = backend.queue;
      }
      const json = (body: unknown) => Response.json(body);
      if (/\/api\/remix\/[^/]+\/queue$/.test(path)) {
        if (body?.text) {
          queue.push({
            id: crypto.randomUUID(),
            text: String(body.text),
            createdAt: Date.now(),
          });
          save();
        }
        return json({
          items: queue,
          active:
            Boolean(threadId) &&
            !["completed", "failed", "canceled"].includes(f.status),
        });
      }
      if (path.startsWith("/api/remix/") && f.offline)
        throw new TypeError("offline");
      if (path === "/api/auth/status")
        return json({
          authenticated: true,
          verified: true,
          user: { id: "e2e", email: "e2e@example.test", name: "Remix test" },
        });
      if (path === "/api/settings")
        return json({ onboarding: JSON.stringify({ v: 2, done: true }) });
      if (path === "/api/health")
        return json({ name: "freestyle", status: "ok" });
      if (path === "/api/remix/turns") {
        if (clientRequestId !== body!.clientRequestId) f.status = "running";
        clientRequestId = String(body!.clientRequestId);
        threadId = String(body!.threadId);
        messages = body!.messages as unknown[];
        save();
        return json({
          turn: { id: turnId, status: f.status, clientRequestId },
        });
      }
      if (path.startsWith("/api/remix/turns/") && path.endsWith("/commands")) {
        if (body?.type === "cancel") f.status = "canceled";
        save();
        return json({ receipt: { accepted: true } });
      }
      if (path === `/api/remix/turns/${turnId}`)
        return json({
          turn: { id: turnId, status: f.status, clientRequestId },
          checkpoint: { messages, assistant: null },
        });
      if (
        path.startsWith("/api/remix/thread/") ||
        path.startsWith("/api/agent/thread/")
      ) {
        if (path.endsWith("/latest"))
          return json({ thread: threadId ? { id: threadId, messages } : null });
        if (path.endsWith("/list"))
          return json({ threads: [], nextCursor: null });
        if (path.endsWith("/runs")) return json({ runs: [] });
        return json({
          thread: threadId ? { id: threadId, messages } : null,
          activeTurn:
            threadId && !["completed", "failed", "canceled"].includes(f.status)
              ? { id: turnId, status: f.status }
              : null,
          pendingAction: null,
        });
      }
      if (path === "/api/agent/activity/stream")
        return new Response(
          'event: activity\ndata: {"threads":[],"changedThreadId":null}\n\n',
          { headers: { "Content-Type": "text/event-stream" } },
        );
      if (path === "/api/agent/activity") return json({ threads: [] });
      if (path === "/api/usage")
        return json({
          remaining: 2400,
          limit: 3000,
          totalConsumed: 600,
          plan: "free",
        });
      if (path === "/api/notifications/token")
        return json({ token: null, userId: null });
      if (path === "/api/connectors/connections")
        return json({ connections: [] });
      if (path.startsWith("/api/connectors/")) return json({ connectors: [] });
      if (
        [
          "/api/keys",
          "/api/models/available",
          "/api/models/configured",
          "/api/plugins",
          "/api/brain/files",
          "/api/dismissed-notifications",
        ].includes(path)
      )
        return json([]);
      return json({ items: [], threads: [], total: 0 });
    };
  });
}

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve(__dirname, "../out/main/index.js")],
    env: {
      ...process.env,
      NODE_ENV: "development",
      FREESTYLE_E2E: "1",
      FREESTYLE_USER_DATA: mkdtempSync(
        join(tmpdir(), "freestyle-remix-recovery-"),
      ),
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });
  pill = await app.firstWindow();
  await pill.evaluate(() => window.api.getServerPort());
  await pill.evaluate(() =>
    window.electron.ipcRenderer.send("e2e:open-dashboard"),
  );
  workspace = await expect
    .poll(() => app.windows().find((page) => page.url().includes("index.html")))
    .toBeTruthy()
    .then(
      () => app.windows().find((page) => page.url().includes("index.html"))!,
    );
  await installFixtures(pill);
  await installFixtures(workspace);
});
test.afterAll(async () => {
  await app?.close();
});

for (const surface of ["compact", "workspace"] as const) {
  async function openSurface() {
    const page = surface === "compact" ? pill : workspace;
    await page.goto(
      `app://renderer/${surface === "compact" ? "pill.html" : "index.html"}?recovery=${Date.now()}${surface === "workspace" ? "#/remix" : ""}`,
    );
    if (surface === "compact") {
      await page.evaluate(() => window.api.getServerPort());
      await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find((window) =>
          window.webContents.getURL().includes("pill.html"),
        )!;
        window.show();
        window.setIgnoreMouseEvents(false);
        window.webContents.send("remix:open-chat");
      });
    }
    const input =
      surface === "compact"
        ? page.getByLabel("Message Remix")
        : page.locator("#panel-composer");
    await expect(input).toBeVisible();
    await page.clock.install();
    await input.fill("Start the recovery test");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: surface === "compact" ? "Stop" : "Stop generating",
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as FixtureWindow).__remixRecovery.calls.some(
            (call) => call.path.startsWith("/api/remix/turns/"),
          ),
        ),
      )
      .toBe(true);
    return { page, input };
  }

  test(`${surface}: offline Stop retains follow-ups and retries cancellation`, async () => {
    const { page, input } = await openSurface();
    await page.evaluate(() => {
      (window as unknown as FixtureWindow).__remixRecovery.offline = true;
    });
    await page.clock.runFor(1_000);
    await expect(
      page.getByRole("button", { name: /Reconnecting/ }),
    ).toBeVisible();
    await input.fill("Keep this follow-up");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".agent-message-queue-text")).toHaveText(
      "Keep this follow-up",
    );
    await page
      .getByRole("button", {
        name: surface === "compact" ? "Stop" : "Stop generating",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: /Reconnecting/ }),
    ).toBeHidden();
    await page.evaluate(() => {
      (window as unknown as FixtureWindow).__remixRecovery.offline = false;
    });
    await page.clock.runFor(3_000);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as FixtureWindow).__remixRecovery.calls.some(
            (call) => call.body?.type === "cancel",
          ),
        ),
      )
      .toBe(true);
    await expect(page.locator(".agent-message-queue-text")).toHaveText(
      "Keep this follow-up",
    );
  });

  test(`${surface}: manual retry is immediate and paused Resume creates a visible new turn`, async () => {
    const { page } = await openSurface();
    await page.evaluate(() => {
      (window as unknown as FixtureWindow).__remixRecovery.offline = true;
    });
    await page.clock.runFor(1_000);
    const count = await page.evaluate(
      () =>
        (window as unknown as FixtureWindow).__remixRecovery.calls.filter(
          (call) => call.path.startsWith("/api/remix/"),
        ).length,
    );
    await page.getByRole("button", { name: /Reconnecting/ }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as FixtureWindow).__remixRecovery.calls.filter(
              (call) => call.path.startsWith("/api/remix/"),
            ).length,
        ),
      )
      .toBe(count + 1);
    for (const delay of [6_000, 12_000, 24_000, 30_000])
      await page.clock.runFor(delay);
    await expect(
      page.getByRole("button", { name: "Connection paused — Resume" }),
    ).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as FixtureWindow).__remixRecovery.offline = false;
    });
    await page
      .getByRole("button", { name: "Connection paused — Resume" })
      .click();
    await expect(
      page.getByText("Continue from where you left off.", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          new Set(
            await page.evaluate(() =>
              (window as unknown as FixtureWindow).__remixRecovery.calls
                .filter((call) => call.path === "/api/remix/turns")
                .map((call) => call.body?.clientRequestId),
            ),
          ).size,
      )
      .toBe(2);
  });

  test(`${surface}: terminal snapshots settle without reconnecting`, async () => {
    for (const status of ["completed", "failed", "canceled"]) {
      const { page } = await openSurface();
      await page.evaluate((status) => {
        (window as unknown as FixtureWindow).__remixRecovery.status = status;
      }, status);
      await page.clock.runFor(1_000);
      await expect(
        page.getByRole("button", {
          name: surface === "compact" ? "Stop" : "Stop generating",
          exact: true,
        }),
      ).toBeHidden();
      await expect(
        page.getByRole("button", { name: /Reconnecting|Connection paused/ }),
      ).toBeHidden();
    }
  });

  if (surface === "compact")
    test("keeps the queue through compact-to-workspace handoff and a closed observer", async () => {
      // Prepare the destination before opening the compact window: focusing
      // the dashboard after that would collapse the native compact surface.
      await workspace.goto(
        "app://renderer/index.html?recovery-resume=handoff#/remix",
      );
      await expect(workspace.locator("#panel-composer")).toBeVisible();
      const { page, input } = await openSurface();
      await input.fill("Survive a handoff");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.locator(".agent-message-queue-text")).toHaveText(
        "Survive a handoff",
      );
      // Exercise the real renderer -> main -> workspace handoff. The frozen
      // renderer clock can leave the transparent native pill hitbox behind
      // its DOM layout, so this lifecycle test dispatches the button event.
      await page
        .getByRole("button", { name: "Open Remix workspace", exact: true })
        .dispatchEvent("click");
      await expect(workspace.locator(".agent-message-queue-text")).toHaveText(
        "Survive a handoff",
      );
      await page.goto("app://renderer/pill.html?recovery-resume=closed");
      await workspace.goto(
        "app://renderer/index.html?recovery-resume=closed#/today",
      );
      await workspace.goto(
        "app://renderer/index.html?recovery-resume=reopen#/remix",
      );
      await expect(workspace.locator(".agent-message-queue-text")).toHaveText(
        "Survive a handoff",
      );
      const submissions = await workspace.evaluate(() =>
        (window as unknown as FixtureWindow).__remixRecovery.calls.filter(
          (call) => call.path === "/api/remix/turns",
        ),
      );
      expect(submissions).toHaveLength(0);
    });
}
