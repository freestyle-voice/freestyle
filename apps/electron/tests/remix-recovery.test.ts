import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
  successfulCancels: number;
  loseEnqueue: boolean;
};
type FixtureWindow = Window & { __remixRecovery: Fixture };
let app: ElectronApplication;
let pill: Page;
let workspace: Page;
let userData: string;

async function installFixtures(page: Page) {
  await page.addInitScript(() => {
    if (!location.search.includes("recovery-resume")) localStorage.clear();
    const f: Fixture = {
      offline: false,
      status: "running",
      calls: [],
      successfulCancels: 0,
      loseEnqueue: false,
    };
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
          turnId,
        }),
      );
    let turnId = "00000000-0000-4000-8000-000000000001";
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
      if (
        location.search.includes("real-remix") &&
        (path.startsWith("/api/remix/") ||
          path.startsWith("/api/agent/thread/") ||
          path.startsWith("/api/agent/turn/"))
      ) {
        if (
          f.loseEnqueue &&
          init?.method === "POST" &&
          /\/api\/remix\/[^/]+\/queue$/.test(path)
        ) {
          f.loseEnqueue = false;
          const response = await original(input, init);
          if (response.ok) throw new Error("Enqueue committed; response lost");
          return response;
        }
        return original(input, init);
      }
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
        turnId = backend.turnId;
      }
      const json = (body: unknown) => Response.json(body);
      if (path === "/api/mcp/calls")
        return json({
          ok: true,
          content: [{ type: "text", text: "Safe MCP test result" }],
        });
      if (path === "/api/remix/identity")
        return json({ userId: "e2e", host: "https://cloud.test" });
      if (/\/api\/remix\/[^/]+\/queue$/.test(path)) {
        if (body?.text && !queue.some((item) => item.id === body.requestId)) {
          queue.push({
            id: String(body.requestId),
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
      if (path === "/api/remix/sessions" && init?.method === "POST")
        return json({
          thread: {
            id: crypto.randomUUID(),
            type: "remote",
            title: null,
            messages: [],
          },
        });
      if (path === "/api/remix/turns") {
        if (clientRequestId !== body!.clientRequestId) {
          f.status = "running";
          turnId = crypto.randomUUID();
        }
        clientRequestId = String(body!.clientRequestId);
        threadId = String(body!.threadId);
        const incoming = body!.messages as Array<{ id: string }>;
        messages = [
          ...messages,
          ...incoming.filter(
            (message) =>
              !(messages as Array<{ id: string }>).some(
                (saved) => saved.id === message.id,
              ),
          ),
        ];
        save();
        return json({
          turn: { id: turnId, status: f.status, clientRequestId },
        });
      }
      if (path.startsWith("/api/remix/turns/") && path.endsWith("/commands")) {
        if (body?.type === "cancel") {
          f.status = "canceled";
          f.successfulCancels++;
        }
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
      if (path.startsWith("/api/agent/turn/") && path.endsWith("/events"))
        return json({ events: [] });
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
  userData = mkdtempSync(join(tmpdir(), "freestyle-remix-recovery-"));
  app = await electron.launch({
    args: [resolve(__dirname, "../out/main/index.js")],
    env: {
      ...process.env,
      NODE_ENV: "development",
      FREESTYLE_E2E: "1",
      FREESTYLE_USER_DATA: userData,
      FREESTYLE_CLOUD_URL: "https://cloud.test",
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
  workspace.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
});
test.afterAll(async () => {
  await app?.close();
});

type CloudTurn = {
  id: string;
  threadId: string;
  clientRequestId: string;
  status: string;
  messages: Array<{ id: string; role: string; parts: unknown[] }>;
  context: unknown;
  retryReceiptSeen?: boolean;
};
type MainFixture = {
  turns: CloudTurn[];
  messages: Record<string, CloudTurn["messages"]>;
  offline: boolean;
  headless: boolean;
  loseAdmission: boolean;
  admissionCount: number;
  approval: boolean;
  loseClaim: boolean;
  claims: string[];
  completions: number;
  checkpointActionId?: string;
  toolName: string;
  startExpired: boolean;
  loseCompletion: boolean;
  actions: Record<string, CloudAction>;
  outputs: unknown[];
  holdExecution: boolean;
  action: CloudAction | null;
};
type CloudAction = {
  id: string;
  turnId: string;
  kind: string;
  toolName: string;
  status: string;
  claimedBy?: string;
  retryOfActionId?: string;
};
type MainFixtureGlobal = {
  __recoveryCloud: MainFixture;
  __originalRecoveryFetch?: typeof fetch;
  __safeExecutions?: string[];
  __releaseSafeExecution?: () => void;
};
function readPersisted(owner: string, kind: "queue" | "cancel") {
  const db = new DatabaseSync(join(userData, "freestyle.db"));
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(
        `remix.${kind}.${encodeURIComponent("https://cloud.test")}.${owner}`,
      ) as { value: string } | undefined;
    if (!row) return [];
    const value = JSON.parse(row.value);
    return kind === "queue" ? Object.values(value) : value;
  } finally {
    db.close();
  }
}
async function closeObservers() {
  await pill.goto(
    "app://renderer/pill.html?real-remix=1&recovery-resume=closed",
  );
  await workspace.goto(
    "app://renderer/index.html?real-remix=1&recovery-resume=closed#/today",
  );
}
async function mainState() {
  return app.evaluate(() => {
    const state = (globalThis as unknown as MainFixtureGlobal).__recoveryCloud;
    return {
      turnCount: state.turns.length,
      completedCount: state.turns.filter((turn) => turn.status === "completed")
        .length,
      canceledCount: state.turns.filter((turn) => turn.status === "canceled")
        .length,
      admissionCount: state.admissionCount,
      claims: state.claims,
      completions: state.completions,
      outputs: state.outputs,
      executions:
        (globalThis as unknown as MainFixtureGlobal).__safeExecutions ?? [],
    };
  });
}
async function installMainCloudFixture(owner: string) {
  // Seed only the disposable app database. All recovery HTTP handlers, local
  // queue writes, and background workers remain the production implementation.
  const db = new DatabaseSync(join(userData, "freestyle.db"));
  db.prepare(
    "INSERT INTO sessions (id, host, token, user_id, email, updated_at) VALUES (NULL, ?, ?, ?, ?, ?) ON CONFLICT(host) DO UPDATE SET token=excluded.token, user_id=excluded.user_id, email=excluded.email, updated_at=excluded.updated_at",
  ).run(
    "https://cloud.test",
    "e2e-token",
    owner,
    "e2e@example.test",
    Date.now(),
  );
  db.close();
  await app.evaluate(({ ipcMain }, owner) => {
    const g = globalThis as unknown as MainFixtureGlobal;
    g.__originalRecoveryFetch ??= globalThis.fetch;
    const state: MainFixture = {
      turns: [],
      messages: {},
      offline: false,
      headless: false,
      loseAdmission: false,
      admissionCount: 0,
      approval: false,
      loseClaim: false,
      claims: [],
      completions: 0,
      action: null,
      actions: {},
      outputs: [],
      toolName: "Bash",
      startExpired: false,
      loseCompletion: false,
      holdExecution: false,
    };
    g.__recoveryCloud = state;
    g.__safeExecutions = [];
    // Exercise real renderer dispatch/IPC without touching the actual clipboard.
    ipcMain.removeHandler("remix:paste-clipboard");
    ipcMain.handle("remix:paste-clipboard", async () => {
      g.__safeExecutions!.push("paste");
      if (state.holdExecution)
        await new Promise<void>((resolve) => {
          g.__releaseSafeExecution = resolve;
        });
      return { ok: true };
    });
    globalThis.fetch = async (input, init) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.origin !== "https://cloud.test")
        return g.__originalRecoveryFetch!(input, init);
      const path = url.pathname;
      if (state.offline) throw new Error("Cloud is offline");
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (path === "/api/auth/get-session")
        return Response.json({
          user: { id: owner, email: "e2e@example.test" },
          session: {},
        });
      if (path.startsWith("/v2/turns/") && path.endsWith("/events"))
        return Response.json({ events: [] });
      if (path === "/v2/remix/turns") {
        state.admissionCount++;
        let turn = state.turns.find(
          (turn) =>
            turn.threadId === body.threadId &&
            turn.clientRequestId === body.clientRequestId,
        );
        if (!turn) {
          turn = {
            ...body,
            id: crypto.randomUUID(),
            status: state.headless
              ? state.loseAdmission
                ? "retryable"
                : "completed"
              : state.approval
                ? state.startExpired
                  ? "needs_desktop"
                  : "waiting_desktop"
                : "running",
          };
          state.turns.push(turn!);
          state.messages[body.threadId] ??= [];
          const messages = state.messages[body.threadId];
          for (const message of body.messages)
            if (!messages.some((saved) => saved.id === message.id))
              messages.push(message);
          if (state.approval) {
            state.action = {
              id: crypto.randomUUID(),
              turnId: turn!.id,
              kind: "desktop",
              toolName: state.toolName,
              status: state.startExpired ? "expired" : "pending",
            };
            state.checkpointActionId = state.action.id;
            state.actions[state.action.id] = state.action;
          }
          if (state.loseAdmission) {
            state.loseAdmission = false;
            throw new Error("Admission committed; response lost");
          }
        } else if (state.headless && turn.status === "retryable") {
          // Recover the lost admission first, then require a separate replay
          // after that accepted turn is observed as retryable by the worker.
          if (turn.retryReceiptSeen) turn.status = "completed";
          turn.retryReceiptSeen = true;
        }
        return Response.json(
          { turn, receipt: { duplicate: true } },
          { status: 202 },
        );
      }
      const turnId = path.split("/")[4];
      const turn = state.turns.find((turn) => turn.id === turnId);
      if (path.includes("/actions/")) {
        const action = state.actions[path.split("/").at(-1)!];
        if (!action || action.turnId !== turnId)
          return Response.json({}, { status: 404 });
        return Response.json({
          action: {
            id: action.id,
            turnId,
            status: action.status,
            toolName: action.toolName,
            invocationId: "invocation",
            ...(action.retryOfActionId
              ? { retryOfActionId: action.retryOfActionId }
              : {}),
          },
        });
      }
      if (path.endsWith("/commands")) {
        if (body.type === "cancel") {
          turn!.status = "canceled";
          return Response.json({ receipt: { canceled: true } });
        }
        if (body.type === "desktop_claim") {
          const action = state.action;
          state.claims.push(body.clientId);
          if (
            !action ||
            (action.status !== "pending" &&
              (action.status !== "claimed" ||
                action.claimedBy !== body.clientId))
          )
            return Response.json({}, { status: 409 });
          action.status = "claimed";
          action.claimedBy = body.clientId;
          if (state.loseClaim) {
            state.loseClaim = false;
            throw new Error("Claim committed; response lost");
          }
          return Response.json({
            action: {
              id: action.id,
              toolName: action.toolName,
              input:
                action.toolName === "Bash"
                  ? { command: "pwd" }
                  : action.toolName.startsWith("mcp_")
                    ? { query: "roadmap" }
                    : {},
            },
          });
        }
        if (body.type === "desktop_complete") {
          if (state.loseCompletion) {
            state.loseCompletion = false;
            throw new Error("Completion offline");
          }
          if (
            turn!.status === "canceled" ||
            state.actions[body.actionId]?.status === "expired"
          )
            return Response.json({}, { status: 409 });
          state.completions++;
          state.outputs.push(body.result);
          state.actions[body.actionId].status = "completed";
          state.action = null;
          turn!.status = "completed";
          return Response.json({ receipt: { accepted: true } });
        }
        if (body.type === "retry_desktop") {
          const previous = state.action!;
          state.action = {
            id: crypto.randomUUID(),
            turnId: turn!.id,
            kind: "desktop",
            toolName: previous.toolName,
            status: "pending",
            retryOfActionId: previous.id,
          };
          state.actions[state.action.id] = state.action;
          turn!.status = "waiting_desktop";
          return Response.json({ action: { id: state.action.id } });
        }
      }
      if (path.startsWith("/v2/remix/turns/") && turn)
        return Response.json({
          turn,
          checkpoint: {
            messages: turn.messages,
            context: turn.context,
            toolState: state.action
              ? [{ actionId: state.action.id, status: state.action.status }]
              : [],
            assistant: state.action
              ? {
                  id: `assistant-${turn.id}`,
                  role: "assistant",
                  parts: [
                    {
                      type: "dynamic-tool",
                      toolName: state.action.toolName,
                      toolCallId: "invocation",
                      state: "output-available",
                      input:
                        state.action.toolName === "Bash"
                          ? { command: "pwd" }
                          : state.action.toolName.startsWith("mcp_")
                            ? { query: "roadmap" }
                            : {},
                      output: {
                        desktopAction: { actionId: state.checkpointActionId },
                      },
                    },
                  ],
                }
              : null,
          },
        });
      if (path.startsWith("/v2/threads")) {
        if (path === "/v2/threads" || path.endsWith("/list"))
          return Response.json({ threads: [], nextCursor: null });
        if (path.endsWith("/runs")) return Response.json({ runs: [] });
        const id = path.endsWith("/latest")
          ? state.turns.at(-1)?.threadId
          : path.split("/")[3];
        return Response.json({
          thread:
            id && state.messages[id]
              ? { id, messages: state.messages[id] }
              : null,
          activeTurn:
            state.turns.find(
              (turn) =>
                turn.threadId === id &&
                !["completed", "canceled", "failed"].includes(turn.status),
            ) ?? null,
          pendingAction:
            state.action?.status === "expired" ? null : state.action,
        });
      }
      return Response.json({});
    };
  }, owner);
}

async function reattachSurface(surface: "compact" | "workspace") {
  const page = surface === "compact" ? pill : workspace;
  await page.goto(
    `app://renderer/${surface === "compact" ? "pill.html" : "index.html"}?real-remix=1&recovery-resume=observer${surface === "workspace" ? "#/remix" : ""}`,
  );
  if (surface === "compact") {
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes("pill.html"),
      )!;
      window.show();
      window.setIgnoreMouseEvents(false);
      window.webContents.send("remix:open-chat");
    });
  }
  return page;
}
const reviewAction = (page: Page) =>
  page.getByRole("button", {
    name: "Desktop action interrupted — Review before retrying",
    exact: true,
  });
const allowAction = (page: Page) =>
  page.getByRole("button", { name: "Allow", exact: true });
const savedCompletions = (page: Page) =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith("remix.recovery."))
      .flatMap(
        (key) => JSON.parse(localStorage.getItem(key)!).completions ?? [],
      ),
  );

for (const surface of ["compact", "workspace"] as const) {
  async function openSurface(real = false, targetSurface = surface) {
    const page = targetSurface === "compact" ? pill : workspace;
    await page.goto(
      `app://renderer/${targetSurface === "compact" ? "pill.html" : "index.html"}?${real ? "real-remix=1&" : ""}recovery=${Date.now()}${targetSurface === "workspace" ? "#/remix" : ""}`,
    );
    if (targetSurface === "compact") {
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
      targetSurface === "compact"
        ? page.getByLabel("Message Remix")
        : page.locator("#panel-composer");
    await expect(input).toBeVisible();
    if (!real) await page.clock.install();
    await input.fill("Start the recovery test");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: targetSurface === "compact" ? "Stop" : "Stop generating",
        exact: true,
      }),
    ).toBeVisible();
    if (!real)
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

  for (const toolName of ["paste", "mcp_1_search"]) {
    test(`${surface}: Allow executes a reviewed ${toolName} replacement once while another observer is attached`, async () => {
      await closeObservers();
      await installMainCloudFixture(`allow-${surface}-${toolName}`);
      await app.evaluate((_, toolName) => {
        const state = (globalThis as unknown as MainFixtureGlobal)
          .__recoveryCloud;
        state.approval = true;
        state.startExpired = true;
        state.toolName = toolName;
      }, toolName);
      await openSurface(true, "compact");
      await expect(reviewAction(pill)).toBeVisible();
      await reattachSurface("workspace");
      await expect(reviewAction(workspace)).toBeVisible();
      const page = surface === "compact" ? pill : workspace;
      const other = surface === "compact" ? workspace : pill;
      await reviewAction(page).click();
      await expect(allowAction(page)).toBeVisible();
      await expect(allowAction(other)).toBeVisible();
      expect((await mainState()).claims).toHaveLength(0);
      expect((await mainState()).executions).toHaveLength(0);
      await allowAction(page).dispatchEvent("click");
      await expect.poll(mainState).toMatchObject({ completions: 1 });
      expect((await mainState()).outputs).toEqual([
        expect.objectContaining({ ok: true }),
      ]);
      if (toolName === "paste")
        expect((await mainState()).executions).toEqual(["paste"]);
      else {
        const mcpCalls = await page.evaluate(() =>
          (window as unknown as FixtureWindow).__remixRecovery.calls.filter(
            (call) => call.path === "/api/mcp/calls",
          ),
        );
        expect(mcpCalls).toEqual([
          {
            path: "/api/mcp/calls",
            body: { toolName: "mcp_1_search", input: { query: "roadmap" } },
          },
        ]);
      }
      await closeObservers();
    });
  }

  if (surface === "workspace") {
    test("attached compact and reattached workspace cannot both execute the same uncertain claim", async () => {
      await closeObservers();
      await installMainCloudFixture("two-observers");
      await app.evaluate(() => {
        const state = (globalThis as unknown as MainFixtureGlobal)
          .__recoveryCloud;
        Object.assign(state, {
          approval: true,
          startExpired: true,
          toolName: "paste",
          loseClaim: true,
          holdExecution: true,
        });
      });
      const { page } = await openSurface(true, "compact");
      await reviewAction(page).click();
      await expect(allowAction(page)).toBeVisible();
      // Exercise confirmation, not the transparent pill's native hitbox.
      await allowAction(page).dispatchEvent("click");
      await expect.poll(async () => (await mainState()).claims.length).toBe(1);
      expect((await mainState()).executions).toEqual([]);
      await reattachSurface("workspace");
      await expect(allowAction(pill)).toBeVisible();
      await expect(allowAction(workspace)).toBeVisible();
      await Promise.all([
        allowAction(pill).dispatchEvent("click"),
        allowAction(workspace).dispatchEvent("click"),
      ]);
      await expect.poll(async () => (await mainState()).claims.length).toBe(3);
      expect(new Set((await mainState()).claims).size).toBe(1);
      expect((await mainState()).executions).toEqual(["paste"]);
      await app.evaluate(() => {
        (globalThis as unknown as MainFixtureGlobal).__releaseSafeExecution?.();
      });
      await expect.poll(mainState).toMatchObject({ completions: 1 });
      await closeObservers();
    });
    test("offline completion expiry observes another device's replacement after reattachment", async () => {
      await closeObservers();
      await installMainCloudFixture("expired-output");
      await app.evaluate(() => {
        Object.assign(
          (globalThis as unknown as MainFixtureGlobal).__recoveryCloud,
          {
            approval: true,
            startExpired: true,
            toolName: "paste",
            loseCompletion: true,
          },
        );
      });
      const { page } = await openSurface(true);
      await reviewAction(page).click();
      await allowAction(page).click();
      await expect.poll(() => savedCompletions(page)).toHaveLength(1);
      expect((await mainState()).executions).toEqual(["paste"]);
      await closeObservers();
      await app.evaluate(() => {
        const state = (globalThis as unknown as MainFixtureGlobal)
          .__recoveryCloud;
        const previous = state.action!;
        previous.status = "expired";
        state.action = {
          ...previous,
          id: crypto.randomUUID(),
          status: "pending",
          claimedBy: undefined,
          retryOfActionId: previous.id,
        };
        state.actions[state.action.id] = state.action;
        state.turns.find((turn) => turn.id === previous.turnId)!.status =
          "waiting_desktop";
      });
      await reattachSurface("workspace");
      await expect(allowAction(workspace)).toBeVisible();
      await expect.poll(() => savedCompletions(workspace)).toHaveLength(0);
      expect((await mainState()).executions).toEqual(["paste"]);
      await workspace
        .getByRole("button", { name: "Don't allow", exact: true })
        .click();
      await expect.poll(mainState).toMatchObject({ completions: 1 });
      expect((await mainState()).executions).toEqual(["paste"]);
      await closeObservers();
    });
  }

  test(`${surface}: real Hono and SQLite drain and cancel after both observers close`, async () => {
    const owner = `live-${surface}`;
    await installMainCloudFixture(owner);
    const { page, input } = await openSurface(true);
    await expect.poll(() => mainState()).toMatchObject({ turnCount: 1 });
    await page.evaluate(() => {
      (window as unknown as FixtureWindow).__remixRecovery.loseEnqueue = true;
    });
    for (const text of ["Headless follow-up one", "Headless follow-up two"]) {
      await input.fill(text);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect
        .poll(() =>
          readPersisted(owner, "queue").flatMap(
            (state: { items: Array<{ text: string }> }) =>
              state.items.map((item) => item.text),
          ),
        )
        .toContain(text);
      await expect
        .poll(() =>
          page.evaluate(() =>
            Object.keys(localStorage)
              .filter((key) => key.startsWith("remix.recovery."))
              .flatMap(
                (key) => JSON.parse(localStorage.getItem(key)!).enqueues ?? [],
              ),
          ),
        )
        .toHaveLength(0);
    }
    expect(
      readPersisted(owner, "queue").flatMap(
        (state: { items: unknown[] }) => state.items,
      ),
    ).toHaveLength(2);
    await expect(page.locator(".agent-message-queue-text")).toContainText(
      "Headless follow-up one",
    );
    await closeObservers();
    await app.evaluate(() => {
      const state = (globalThis as unknown as MainFixtureGlobal)
        .__recoveryCloud;
      state.turns[0].status = "completed";
      state.loseAdmission = true;
      state.headless = true;
    });
    await expect
      .poll(mainState, { timeout: 15_000 })
      .toMatchObject({ turnCount: 3, completedCount: 3 });
    expect(
      readPersisted(owner, "queue").flatMap(
        (state: { items: unknown[] }) => state.items,
      ),
    ).toHaveLength(0);
    const admitted = await mainState();
    expect(admitted.admissionCount).toBe(5); // Lost receipt + retryable replay, not duplicate turns.
    await workspace.goto(
      "app://renderer/index.html?real-remix=1&recovery-resume=headless#/remix",
    );
    await expect(
      workspace.getByText("Headless follow-up two", { exact: true }),
    ).toBeVisible();
    await expect.poll(mainState).toMatchObject({ turnCount: 3 });
    await app.evaluate(() => {
      (globalThis as unknown as MainFixtureGlobal).__recoveryCloud.headless =
        false;
    });
    await workspace
      .locator("#panel-composer")
      .fill("Cancel through the real outbox");
    await workspace.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(mainState).toMatchObject({ turnCount: 4 });
    await app.evaluate(() => {
      (globalThis as unknown as MainFixtureGlobal).__recoveryCloud.offline =
        true;
    });
    await workspace
      .getByRole("button", { name: "Stop generating", exact: true })
      .click();
    await expect
      .poll(() => readPersisted(owner, "cancel").flat())
      .toHaveLength(1);
    await closeObservers();
    await app.evaluate(() => {
      (globalThis as unknown as MainFixtureGlobal).__recoveryCloud.offline =
        false;
    });
    await expect
      .poll(mainState, { timeout: 15_000 })
      .toMatchObject({ canceledCount: 1 });
    await expect
      .poll(() => readPersisted(owner, "cancel").flat())
      .toHaveLength(0);
  });

  if (surface === "workspace")
    test("workspace: real proxy recovers lost claims and explicitly reviews expired replacements", async () => {
      await installMainCloudFixture("live-claims");
      await app.evaluate(() => {
        const state = (globalThis as unknown as MainFixtureGlobal)
          .__recoveryCloud;
        state.approval = true;
        state.loseClaim = true;
      });
      const { page } = await openSurface(true);
      await page
        .getByRole("button", { name: "Don't allow", exact: true })
        .click();
      await expect.poll(mainState).toMatchObject({ completions: 0 });
      await expect.poll(async () => (await mainState()).claims.length).toBe(1);
      await page.goto(
        "app://renderer/index.html?real-remix=1&recovery-resume=claim#/remix",
      );
      await page
        .getByRole("button", { name: "Don't allow", exact: true })
        .click();
      await expect.poll(mainState).toMatchObject({ completions: 1 });
      const first = await mainState();
      expect(first.claims).toHaveLength(2);
      expect(first.claims[1]).toBe(first.claims[0]);
      await app.evaluate(() => {
        (globalThis as unknown as MainFixtureGlobal).__recoveryCloud.loseClaim =
          true;
      });
      await page.locator("#panel-composer").fill("A second approval");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page
        .getByRole("button", { name: "Don't allow", exact: true })
        .click();
      await expect.poll(async () => (await mainState()).claims.length).toBe(3);
      await app.evaluate(() => {
        const state = (globalThis as unknown as MainFixtureGlobal)
          .__recoveryCloud;
        state.action!.status = "expired";
        state.turns.find((turn) => turn.id === state.action!.turnId)!.status =
          "needs_desktop";
      });
      await page
        .getByRole("button", {
          name: "Desktop action interrupted — Review before retrying",
          exact: true,
        })
        .click();
      expect((await mainState()).claims).toHaveLength(3);
      await page
        .getByRole("button", { name: "Don't allow", exact: true })
        .last()
        .click();
      await expect.poll(mainState).toMatchObject({ completions: 2 });
      expect((await mainState()).claims).toHaveLength(4);
    });

  if (surface === "workspace")
    test("workspace: editing branches append-only history instead of losing the revision", async () => {
      await installMainCloudFixture("live-edit");
      const { page } = await openSurface(true);
      await app.evaluate(() => {
        (
          globalThis as unknown as MainFixtureGlobal
        ).__recoveryCloud.turns[0].status = "completed";
      });
      await expect(
        page.getByRole("button", { name: "Stop generating", exact: true }),
      ).toBeHidden();
      await page.locator(".tavern-msg-user-wrap").first().hover();
      await page
        .getByRole("button", { name: "Edit in new chat", exact: true })
        .first()
        .click();
      await page
        .getByLabel("Edit message", { exact: true })
        .fill("The revised question");
      await page
        .getByRole("button", { name: "Send in new chat", exact: true })
        .click();
      await expect.poll(mainState).toMatchObject({ turnCount: 2 });
      await expect(
        page.getByText("The revised question", { exact: true }),
      ).toBeVisible();
      const history = await app.evaluate(
        () =>
          (globalThis as unknown as MainFixtureGlobal).__recoveryCloud.messages,
      );
      expect(Object.keys(history)).toHaveLength(2);
      expect(
        Object.values(history).map((messages) => messages[0].parts),
      ).toEqual([
        [{ type: "text", text: "Start the recovery test" }],
        [{ type: "text", text: "The revised question" }],
      ]);
    });

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
        page.evaluate(
          () =>
            (window as unknown as FixtureWindow).__remixRecovery
              .successfulCancels > 0 &&
            (window as unknown as FixtureWindow).__remixRecovery.status ===
              "canceled" &&
            Object.entries(localStorage)
              .filter(([key]) => key.startsWith("remix.recovery."))
              .every(([, value]) => JSON.parse(value).cancels.length === 0),
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
      if (status === "failed")
        await expect(
          page.getByText("Remix couldn't complete this turn.", { exact: true }),
        ).toBeVisible();
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
