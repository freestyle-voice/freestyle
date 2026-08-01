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
  dashboard: Page;
  eventsPath: string;
}

async function waitForDashboard(app: ElectronApplication): Promise<Page> {
  await app.firstWindow();
  await expect
    .poll(() => app.windows().find((page) => !page.url().includes("pill")))
    .toBeTruthy();
  const dashboard = app.windows().find((page) => !page.url().includes("pill"));
  if (!dashboard) throw new Error("Dashboard window did not open");
  await dashboard.waitForLoadState("domcontentloaded");
  return dashboard;
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

  return { app, dashboard: await waitForDashboard(app), eventsPath };
}

async function waitForStartupPermissionChecks(
  eventsPath: string,
): Promise<void> {
  await expect
    .poll(() => {
      const events = readEvents(eventsPath);
      return (
        events.some((event) => event.type === "accessibility-check") &&
        events.some((event) => event.type === "media-check")
      );
    })
    .toBe(true);
}

function permissionDialogs(eventsPath: string): RecordedEvent[] {
  return readEvents(eventsPath).filter((event) => event.type === "dialog");
}

async function triggerHotkeyDown(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.electron.ipcRenderer.send("e2e:trigger-hotkey-down");
  });
}

async function instrumentMicrophoneRequest(
  app: ElectronApplication,
): Promise<void> {
  const pill = app.windows().find((page) => page.url().includes("pill"));
  if (!pill) throw new Error("Pill window did not open");
  await pill.evaluate(() => {
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

test("startup warns once and opens Accessibility settings when requested", async () => {
  const launched = await launchPermissionApp({
    accessibility: "denied",
    onboardingComplete: true,
    dialogResponse: 0,
  });
  try {
    await waitForStartupPermissionChecks(launched.eventsPath);
    await expect
      .poll(
        () =>
          readEvents(launched.eventsPath).filter(
            (event) =>
              event.type === "dialog" &&
              event.options?.title === "Accessibility Permission Required",
          ).length,
      )
      .toBe(1);

    const events = readEvents(launched.eventsPath);
    const warning = events.find((event) => event.type === "dialog")?.options;
    expect(warning?.message).toContain(
      "required for dictation and text insertion",
    );
    expect(warning?.buttons).toContain("Open System Settings");
    expect(
      events.some(
        (event) =>
          event.type === "open-external" &&
          event.url?.includes("Privacy_Accessibility"),
      ),
    ).toBe(true);
  } finally {
    await launched.app.close();
  }
});

test("startup does not warn when Accessibility permission is granted", async () => {
  const launched = await launchPermissionApp({
    accessibility: "granted",
    onboardingComplete: true,
  });
  try {
    await waitForStartupPermissionChecks(launched.eventsPath);
    expect(permissionDialogs(launched.eventsPath)).toHaveLength(0);
  } finally {
    await launched.app.close();
  }
});

test("onboarding does not receive a duplicate startup warning", async () => {
  const launched = await launchPermissionApp({
    accessibility: "denied",
    microphone: "denied",
    onboardingComplete: false,
  });
  try {
    await expect.poll(() => launched.dashboard.url()).toContain("/onboarding");
    await waitForStartupPermissionChecks(launched.eventsPath);
    expect(permissionDialogs(launched.eventsPath)).toHaveLength(0);
  } finally {
    await launched.app.close();
  }
});

test("startup warns for denied Microphone and opens its privacy settings", async () => {
  const launched = await launchPermissionApp({
    accessibility: "granted",
    microphone: "denied",
    onboardingComplete: true,
    dialogResponse: 0,
  });
  try {
    await waitForStartupPermissionChecks(launched.eventsPath);
    await expect
      .poll(() => permissionDialogs(launched.eventsPath).length)
      .toBe(1);

    const events = readEvents(launched.eventsPath);
    const warning = permissionDialogs(launched.eventsPath)[0]?.options;
    expect(warning?.title).toBe("Microphone Permission Required");
    expect(warning?.message).toContain(
      "Microphone access is required to record dictation",
    );
    expect(warning?.buttons).toContain("Open System Settings");
    expect(
      events.some(
        (event) =>
          event.type === "open-external" &&
          event.url?.includes("Privacy_Microphone"),
      ),
    ).toBe(true);
    expect(events.some((event) => event.type === "pipeline-event")).toBe(false);
    expect(events.some((event) => event.type === "mic-requested")).toBe(false);
  } finally {
    await launched.app.close();
  }
});

test("startup warns when Microphone permission is restricted", async () => {
  const launched = await launchPermissionApp({
    accessibility: "granted",
    microphone: "restricted",
    onboardingComplete: true,
  });
  try {
    await waitForStartupPermissionChecks(launched.eventsPath);
    await expect
      .poll(() => permissionDialogs(launched.eventsPath).length)
      .toBe(1);
    expect(permissionDialogs(launched.eventsPath)[0]?.options?.title).toBe(
      "Microphone Permission Required",
    );
  } finally {
    await launched.app.close();
  }
});

for (const microphone of ["granted", "not-determined"] as const) {
  test(`startup does not warn when Microphone permission is ${microphone}`, async () => {
    const launched = await launchPermissionApp({
      accessibility: "granted",
      microphone,
      onboardingComplete: true,
    });
    try {
      await waitForStartupPermissionChecks(launched.eventsPath);
      expect(permissionDialogs(launched.eventsPath)).toHaveLength(0);
    } finally {
      await launched.app.close();
    }
  });
}

test("startup combines missing Accessibility and Microphone into one warning", async () => {
  const launched = await launchPermissionApp({
    accessibility: "denied",
    microphone: "denied",
    onboardingComplete: true,
    dialogResponse: 1,
  });
  try {
    await waitForStartupPermissionChecks(launched.eventsPath);
    await expect
      .poll(() => permissionDialogs(launched.eventsPath).length)
      .toBe(1);

    const events = readEvents(launched.eventsPath);
    const warning = permissionDialogs(launched.eventsPath)[0]?.options;
    expect(warning?.title).toBe("Permissions Required");
    expect(warning?.message).toContain(
      "Accessibility and Microphone permissions are required",
    );
    expect(warning?.buttons).toEqual([
      "Open Accessibility Settings",
      "Open Microphone Settings",
      "Not Now",
    ]);
    expect(events.filter((event) => event.type === "open-external")).toEqual([
      expect.objectContaining({
        url: expect.stringContaining("Privacy_Microphone"),
      }),
    ]);
    expect(events.some((event) => event.type === "pipeline-event")).toBe(false);
    expect(events.some((event) => event.type === "mic-requested")).toBe(false);
  } finally {
    await launched.app.close();
  }
});

test("denied Accessibility blocks dictation before RecordingStarted", async () => {
  const launched = await launchPermissionApp({
    accessibility: "denied",
    onboardingComplete: true,
  });
  try {
    await waitForStartupPermissionChecks(launched.eventsPath);
    await instrumentMicrophoneRequest(launched.app);
    const dialogsBefore = readEvents(launched.eventsPath).filter(
      (event) => event.type === "dialog",
    ).length;
    await triggerHotkeyDown(launched.dashboard);
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
          .filter((window) => window.webContents.getURL().includes("pill"))
          .some((window) => window.isVisible()),
      ),
    ).toBe(false);
  } finally {
    await launched.app.close();
  }
});

test("denied Microphone blocks dictation before RecordingStarted", async () => {
  const launched = await launchPermissionApp({
    accessibility: "granted",
    microphone: "denied",
    onboardingComplete: true,
  });
  try {
    await waitForStartupPermissionChecks(launched.eventsPath);
    await instrumentMicrophoneRequest(launched.app);
    const dialogsBefore = permissionDialogs(launched.eventsPath).length;
    await triggerHotkeyDown(launched.dashboard);
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
    await launched.app.close();
  }
});

test("granted permissions allow the existing dictation flow", async () => {
  const launched = await launchPermissionApp({
    accessibility: "granted",
    microphone: "granted",
    onboardingComplete: true,
  });
  try {
    await waitForStartupPermissionChecks(launched.eventsPath);
    await instrumentMicrophoneRequest(launched.app);
    await triggerHotkeyDown(launched.dashboard);
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
          (event) => event.type === "mic-requested",
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        launched.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .filter((window) => window.webContents.getURL().includes("pill"))
            .some((window) => window.isVisible()),
        ),
      )
      .toBe(true);
  } finally {
    await launched.app.close();
  }
});
