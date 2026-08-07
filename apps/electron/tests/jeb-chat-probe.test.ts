import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type ElectronApplication,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { _electron as electron } from "playwright";

// Temporary visual probe: opens the Jeb chat and screenshots the pill window
// so the manga-bubble geometry (lift + tail + side) can be inspected.

let app: ElectronApplication | undefined;
let fakeServer: Server;

const THREAD = {
  threadId: 1,
  resumed: true,
  messages: [
    {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "make this warmer and shorter" }],
    },
    {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "Done. Three cuts, meaning untouched." }],
    },
  ],
};

test.beforeAll(async () => {
  fakeServer = createServer((req, res) => {
    const url = req.url ?? "";
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,OPTIONS",
    );
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }
    res.setHeader("Content-Type", "application/json");
    const send = (body: unknown) => res.end(JSON.stringify(body));
    if (url.startsWith("/api/health")) {
      return send({ status: "ok", name: "freestyle" });
    }
    if (url.startsWith("/api/remix/thread")) return send(THREAD);
    if (url.startsWith("/api/config")) return send({ version: 1, flags: {} });
    if (
      url.startsWith("/api/dismissed-notifications") ||
      url.startsWith("/api/models") ||
      url.startsWith("/api/keys")
    ) {
      return send([]);
    }
    if (url.startsWith("/api/whisper/status")) {
      return send({
        binaryAvailable: false,
        binaryDownloading: false,
        serverBinaryAvailable: false,
        serverRunning: false,
        serverFailed: false,
        modelsDir: "",
        models: [],
        modelDefinitions: [],
      });
    }
    return send({});
  });
  await new Promise<void>((r) => fakeServer.listen(0, "127.0.0.1", r));
  const port = (fakeServer.address() as { port: number }).port;

  const userDataDir = mkdtempSync(join(tmpdir(), "freestyle-jebprobe-"));
  writeFileSync(
    join(userDataDir, "settings.json"),
    JSON.stringify({
      serverUrl: `http://127.0.0.1:${port}`,
      onboardingComplete: true,
      showDashboardOnLaunch: false,
    }),
  );

  app = await electron.launch({
    args: [resolve(__dirname, "../out/main/index.js")],
    env: {
      ...process.env,
      NODE_ENV: "development",
      FREESTYLE_USER_DATA: userDataDir,
      FREESTYLE_DB_PATH: join(userDataDir, "freestyle.db"),
      FREESTYLE_E2E: "1",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
    timeout: 30_000,
  });
  await app.firstWindow();
});

test.afterAll(async () => {
  await app?.close().catch(() => {});
  await new Promise((r) => fakeServer.close(r));
});

test("screenshot the open jeb chat", async () => {
  test.setTimeout(60_000);
  let pillPage: Page | undefined;
  for (let i = 0; i < 40 && !pillPage; i++) {
    pillPage = app!.windows().find((w) => w.url().includes("pill"));
    if (!pillPage) await new Promise((r) => setTimeout(r, 250));
  }
  expect(pillPage, "pill window").toBeTruthy();
  await pillPage!.waitForLoadState("domcontentloaded");
  await new Promise((r) => setTimeout(r, 2000));

  const probe = await pillPage!.evaluate(async () => {
    const pos = await window.api.getPillPosition();
    return { pos };
  });
  console.log("pill position seen by renderer:", JSON.stringify(probe));

  await app!.evaluate(({ BrowserWindow }) => {
    const pill = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("pill"),
    );
    pill?.webContents.send("remix:open-chat");
  });
  await new Promise((r) => setTimeout(r, 1800));

  const layout = await pillPage!.evaluate(() => {
    const morph = document.querySelector(
      ".pill-chat-morph",
    ) as HTMLElement | null;
    const layer = morph?.parentElement;
    const tail = layer?.querySelector("svg polygon");
    return {
      morphStyle: morph
        ? {
            marginBottom: getComputedStyle(morph).marginBottom,
            borderRadius: getComputedStyle(morph).borderRadius,
            background: getComputedStyle(morph).backgroundColor,
            rect: morph.getBoundingClientRect().toJSON(),
          }
        : null,
      layerClass: layer?.className ?? null,
      hasTail: !!tail,
    };
  });
  console.log("chat layout:", JSON.stringify(layout, null, 2));

  await pillPage!.screenshot({
    path: join(__dirname, "..", "test-results", "jeb-chat-probe.png"),
  });
});
