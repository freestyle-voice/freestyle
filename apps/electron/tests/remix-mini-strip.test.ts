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

let app: ElectronApplication | undefined;
let fakeServer: Server;

const FINAL_MESSAGE = [
  "Done — I rewrote the paragraph in place.",
  "",
  "I made it warmer, cut the length roughly in half, and signed it off from you. The original is one Cmd+Z away if you want it back.",
].join("\n");

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
      parts: [{ type: "text", text: FINAL_MESSAGE }],
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

  const userDataDir = mkdtempSync(join(tmpdir(), "freestyle-probe-ud-"));
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

// The remix session holds the full chat-sized window (440x600) for its whole
// life: chat, strip, and every morph between them are DOM animation inside
// room that already exists, and the window only resizes while nothing is
// visible. Window bounds are therefore constant during a session, and the
// morphs are asserted through the surface's style targets — the *state* of
// the animation, which holds even on CI runners whose compositor never
// produces frames (Xvfb), where animated rects sit frozen mid-flight.

test("settled remix strip grows around the final message", async () => {
  test.setTimeout(60_000);
  // Find the pill window.
  let pillPage: Page | undefined;
  for (let i = 0; i < 40 && !pillPage; i++) {
    pillPage = app!.windows().find((w) => w.url().includes("pill"));
    if (!pillPage) await new Promise((r) => setTimeout(r, 250));
  }
  expect(pillPage, "pill window").toBeTruthy();
  await pillPage!.waitForLoadState("domcontentloaded");
  await new Promise((r) => setTimeout(r, 2500));

  // Open the chat card (the bar-hover path).
  await app!.evaluate(({ BrowserWindow }) => {
    const pill = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("pill"),
    );
    pill?.webContents.send("remix:open-chat");
  });
  await new Promise((r) => setTimeout(r, 1500));

  const expanded = await app!.evaluate(({ BrowserWindow }) => {
    const pill = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("pill"),
    );
    return pill?.getBounds();
  });
  console.log("after open-chat:", JSON.stringify(expanded));
  expect(expanded?.width).toBe(440);
  expect(expanded?.height).toBe(600);

  // The pointer "leaves the window": the card minimizes to the strip after
  // its grace period (380ms). The window keeps the held room — only the DOM
  // surface changes. The settled strip self-dismisses 3s after minimizing,
  // so everything below reads promptly inside that window.
  await pillPage!.evaluate(() => {
    document.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 1300));

  const stripText = await pillPage!.evaluate(
    () =>
      (document.querySelector(".remix-mini-message") as HTMLElement | null)
        ?.innerText ?? null,
  );
  console.log("strip message:", JSON.stringify(stripText));

  const held = await app!.evaluate(({ BrowserWindow }) => {
    const pill = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("pill"),
    );
    return pill?.getBounds();
  });
  console.log("after minimize:", JSON.stringify(held));
  expect(held?.width).toBe(440);
  expect(held?.height).toBe(600);

  // The strip itself is the surface, sized around the final message.
  const strip = await pillPage!.evaluate(() => {
    const el = document.querySelector(".pill-chat-morph") as HTMLElement | null;
    return el ? { width: el.style.width, height: el.style.height } : null;
  });
  console.log("strip surface:", JSON.stringify(strip));
  expect(strip?.width).toBe("320px");
  expect(Number.parseInt(strip?.height ?? "0", 10)).toBeGreaterThan(44);
  expect(stripText).toContain("one Cmd+Z away");

  // The settled strip hands the corner back on its own — the session closes
  // and the window returns to the collapsed pill slot.
  await new Promise((r) => setTimeout(r, 3200));
  const dismissed = await app!.evaluate(({ BrowserWindow }) => {
    const pill = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("pill"),
    );
    return pill?.getBounds();
  });
  console.log("after dismiss:", JSON.stringify(dismissed));
  expect(dismissed?.width).toBe(160);
});

test("hovering the strip morphs the chat surface open in place", async () => {
  test.setTimeout(60_000);
  let pillPage: Page | undefined;
  for (let i = 0; i < 40 && !pillPage; i++) {
    pillPage = app!.windows().find((w) => w.url().includes("pill"));
    if (!pillPage) await new Promise((r) => setTimeout(r, 250));
  }
  expect(pillPage, "pill window").toBeTruthy();

  const bounds = () =>
    app!.evaluate(({ BrowserWindow }) => {
      const pill = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("pill"),
      );
      return pill?.getBounds();
    });

  await app!.evaluate(({ BrowserWindow }) => {
    const pill = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("pill"),
    );
    pill?.webContents.send("remix:open-chat");
  });
  await new Promise((r) => setTimeout(r, 1500));
  expect((await bounds())?.height).toBe(600);

  await pillPage!.evaluate(() => {
    document.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 1300));
  // Held room: minimizing swaps the surface, never the window.
  const mini = await bounds();
  expect(mini?.width).toBe(440);
  expect(mini?.height).toBe(600);
  const hasStrip = await pillPage!.evaluate(
    () => document.querySelector('[data-testid="remix-chat-mini"]') !== null,
  );
  expect(hasStrip).toBe(true);

  // Hover the strip: the surface morphs to the full conversation while the
  // window sits still. The style targets flip promptly (the morph itself is
  // a 320ms transition inside them).
  await pillPage!.evaluate(() => {
    const strip = document.querySelector('[data-testid="remix-chat-mini"]');
    strip?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 300));
  const grown = await bounds();
  console.log("after hover:", JSON.stringify(grown));
  expect(grown?.width).toBe(440);
  expect(grown?.height).toBe(600);

  const surface = await pillPage!.evaluate(() => {
    const el = document.querySelector(".pill-chat-morph") as HTMLElement | null;
    return el ? { width: el.style.width, height: el.style.height } : null;
  });
  console.log("surface target after hover:", JSON.stringify(surface));
  expect(surface?.width).toBe("408px");
  expect(surface?.height).toBe("560px");
  const hasFullChat = await pillPage!.evaluate(
    () => document.querySelector('[data-testid="remix-chat"]') !== null,
  );
  expect(hasFullChat).toBe(true);

  // Leave everything closed for any test that follows.
  await pillPage!.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
});
