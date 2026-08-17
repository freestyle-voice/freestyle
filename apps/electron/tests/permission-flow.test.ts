import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type ElectronApplication,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { _electron as electron } from "playwright";

test.skip(
  process.platform !== "darwin",
  "Permission flow integration tests require macOS permission APIs.",
);

interface RecordedEvent {
  type: string;
  prompt?: boolean;
  options?: {
    title?: string;
    message?: string;
    detail?: string;
    buttons?: string[];
  };
  body?: { type?: string };
  url?: string;
}

interface LaunchOptions {
  accessibility: "granted" | "denied";
  microphone?: "granted" | "denied" | "restricted" | "not-determined";
  onboardingComplete: boolean;
  dialogResponse?: number;
}

interface LaunchedApp {
  app: ElectronApplication;
  companion: Page;
  eventsPath: string;
}

async function closePermissionApp(app: ElectronApplication): Promise<void> {
  const childProcess = app.process();
  if (childProcess.exitCode !== null || childProcess.signalCode !== null)
    return;

  // This fixture validates startup permissions, not production shutdown.
  // Avoid app.close(), which runs native cleanup that intermittently wedges
  // macOS CI and leaves Playwright waiting through two 60-second timeouts.
  const exited = new Promise<void>((resolve) => {
    childProcess.once("exit", () => resolve());
  });
  childProcess.kill("SIGKILL");
  await Promise.race([
    exited,
    new Promise<void>((resolve) => {
      setTimeout(resolve, 5_000);
    }),
  ]);
}

async function waitForCompanion(app: ElectronApplication): Promise<Page> {
  await app.firstWindow();
  await expect
    .poll(() => app.windows().find((page) => page.url().includes("companion")))
    .toBeTruthy();
  const companion = app
    .windows()
    .find((page) => page.url().includes("companion"));
  if (!companion) throw new Error("Companion window did not open");
  await companion.waitForLoadState("domcontentloaded");
  return companion;
}

function readEvents(eventsPath: string): RecordedEvent[] {
  if (!existsSync(eventsPath)) return [];
  return readFileSync(eventsPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RecordedEvent);
}

async function launchPermissionApp(
  options: LaunchOptions,
): Promise<LaunchedApp> {
  const testDir = mkdtempSync(join(tmpdir(), "freestyle-permissions-e2e-"));
  const userDataDir = join(testDir, "user-data");
  const eventsPath = join(testDir, "events.jsonl");
  mkdirSync(userDataDir, { recursive: true });
  writeFileSync(
    join(userDataDir, "settings.json"),
    JSON.stringify({ onboardingComplete: options.onboardingComplete }),
  );

  const app = await electron.launch({
    args: [
      resolve(__dirname, "fixtures/permission-main.cjs"),
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
    env: {
      ...process.env,
      NODE_ENV: "development",
      FREESTYLE_E2E: "1",
      FREESTYLE_E2E_ACCESSIBILITY: options.accessibility,
      FREESTYLE_E2E_MICROPHONE: options.microphone ?? "granted",
      FREESTYLE_E2E_DIALOG_RESPONSE: String(options.dialogResponse ?? 1),
      FREESTYLE_E2E_ONBOARDING_COMPLETE: String(options.onboardingComplete),
      FREESTYLE_E2E_PERMISSION_EVENTS: eventsPath,
      FREESTYLE_E2E_USER_DATA_DIR: userDataDir,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
    timeout: 30_000,
  });

  return { app, companion: await waitForCompanion(app), eventsPath };
}

async function waitForBoot(app: ElectronApplication): Promise<void> {
  await expect
    .poll(async () => {
      try {
        return await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some((win) => win.isVisible()),
        );
      } catch {
        return false;
      }
    })
    .toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 1_500));
}

function permissionDialogs(eventsPath: string): RecordedEvent[] {
  return readEvents(eventsPath).filter((event) => event.type === "dialog");
}

async function triggerHotkeyDown(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.electron.ipcRenderer.send("e2e:trigger-hotkey-down");
  });
}

async function triggerEscape(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.electron.ipcRenderer.send("e2e:trigger-escape");
  });
}

async function instrumentMicrophoneRequest(
  app: ElectronApplication,
): Promise<void> {
  const companion = app
    .windows()
    .find((page) => page.url().includes("companion"));
  if (!companion) throw new Error("Companion window did not open");
  await companion.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        window.electron.ipcRenderer.send("e2e:mic-requested");
        return original(constraints);
      },
    });
  });
}

test("launch never shows a permission dialog, even with everything denied", async () => {
  const launched = await launchPermissionApp({
    accessibility: "denied",
    microphone: "denied",
    onboardingComplete: false,
  });
  try {
    await waitForBoot(launched.app);
    expect(permissionDialogs(launched.eventsPath)).toHaveLength(0);
    expect(
      readEvents(launched.eventsPath).some(
        (event) => event.type === "accessibility-check" && event.prompt,
      ),
    ).toBe(false);
  } finally {
    await closePermissionApp(launched.app);
  }
});

test("denied Accessibility blocks dictation before RecordingStarted", async () => {
  const launched = await launchPermissionApp({
    accessibility: "denied",
    onboardingComplete: true,
  });
  try {
    await waitForBoot(launched.app);
    await instrumentMicrophoneRequest(launched.app);

    // A signed-out launch auto-opens the panel (sign-in gate). Wait for the
    // startup decision to land — panel visible (signed out), or an
    // authenticated session on the default port (a dev machine running the
    // real app, where no panel will open) — then hide any panel so the
    // blocked-hotkey assertion below observes only what the hotkey itself
    // surfaces.
    await expect
      .poll(
        async () => {
          const visible = await launched.app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()
              .filter((window) => window.webContents.getURL().includes("panel"))
              .some((window) => window.isVisible()),
          );
          if (visible) return true;
          return await fetch("http://127.0.0.1:4649/api/auth/status")
            .then(async (res) =>
              res.ok
                ? (
                    (await res.json()) as {
                      authenticated?: boolean;
                    }
                  ).authenticated === true
                : false,
            )
            .catch(() => false);
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    await launched.app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (window.webContents.getURL().includes("panel")) window.hide();
      }
    });

    const dialogsBefore = readEvents(launched.eventsPath).filter(
      (event) => event.type === "dialog",
    ).length;
    await triggerHotkeyDown(launched.companion);
    await expect
      .poll(
        () =>
          readEvents(launched.eventsPath).filter(
            (event) => event.type === "dialog",
          ).length,
      )
      .toBe(dialogsBefore + 1);

    const events = readEvents(launched.eventsPath);
    expect(
      events.some(
        (event) =>
          event.type === "pipeline-event" &&
          event.body?.type === "recordingStarted",
      ),
    ).toBe(false);
    expect(events.some((event) => event.type === "mic-requested")).toBe(false);
    expect(
      await launched.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .filter((window) => window.webContents.getURL().includes("panel"))
          .some((window) => window.isVisible()),
      ),
    ).toBe(false);
  } finally {
    await closePermissionApp(launched.app);
  }
});

test("denied Microphone blocks dictation before RecordingStarted", async () => {
  const launched = await launchPermissionApp({
    accessibility: "granted",
    microphone: "denied",
    onboardingComplete: true,
  });
  try {
    await waitForBoot(launched.app);
    await instrumentMicrophoneRequest(launched.app);
    const dialogsBefore = permissionDialogs(launched.eventsPath).length;
    await triggerHotkeyDown(launched.companion);
    await expect
      .poll(() => permissionDialogs(launched.eventsPath).length)
      .toBe(dialogsBefore + 1);

    expect(
      readEvents(launched.eventsPath).some(
        (event) =>
          event.type === "pipeline-event" &&
          event.body?.type === "recordingStarted",
      ),
    ).toBe(false);
    expect(
      readEvents(launched.eventsPath).some(
        (event) => event.type === "mic-requested",
      ),
    ).toBe(false);
  } finally {
    await closePermissionApp(launched.app);
  }
});

test("granted permissions allow the existing dictation flow", async () => {
  const launched = await launchPermissionApp({
    accessibility: "granted",
    microphone: "granted",
    onboardingComplete: true,
  });
  try {
    await waitForBoot(launched.app);
    await instrumentMicrophoneRequest(launched.app);
    await triggerHotkeyDown(launched.companion);
    await expect
      .poll(() =>
        readEvents(launched.eventsPath).some(
          (event) =>
            event.type === "pipeline-event" &&
            event.body?.type === "recordingStarted",
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        readEvents(launched.eventsPath).some(
          (event) =>
            event.type === "dictation-state" &&
            event.body?.phase === "recording",
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        launched.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .filter((window) =>
              window.webContents.getURL().includes("companion"),
            )
            .some((window) => window.isVisible()),
        ),
      )
      .toBe(true);
  } finally {
    await closePermissionApp(launched.app);
  }
});

test("Escape cancels an active dictation session", async () => {
  const launched = await launchPermissionApp({
    accessibility: "granted",
    microphone: "granted",
    onboardingComplete: true,
  });
  try {
    await waitForBoot(launched.app);
    await instrumentMicrophoneRequest(launched.app);
    await triggerHotkeyDown(launched.companion);
    await expect
      .poll(() =>
        readEvents(launched.eventsPath).some(
          (event) =>
            event.type === "dictation-state" &&
            event.body?.phase === "recording",
        ),
      )
      .toBe(true);

    await triggerEscape(launched.companion);

    await expect
      .poll(() =>
        readEvents(launched.eventsPath).some(
          (event) =>
            event.type === "dictation-state" && event.body?.phase === "idle",
        ),
      )
      .toBe(true);
  } finally {
    await closePermissionApp(launched.app);
  }
});
