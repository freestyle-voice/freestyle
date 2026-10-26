import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const shots = process.env.FREESTYLE_SETUP_SCREENSHOTS;
const capture = async (page: Page, name: string) => {
  if (!shots) return;
  const previous = page.viewportSize()!;
  const setupState = name.startsWith("setup-") && name !== "setup-models";
  if (setupState) await page.setViewportSize({ width: 1200, height: 1400 });
  await page.evaluate(() => document.fonts.ready);
  const content = setupState
    ? await page
        .getByRole("heading", { level: 1 })
        .locator("..")
        .locator("..")
        .boundingBox()
    : null;
  await page.screenshot({
    clip: content
      ? {
          x: content.x - 24,
          y: content.y - 24,
          width: content.width + 48,
          height: content.height + 48,
        }
      : {
          x: 0,
          y: 0,
          width: page.viewportSize()!.width,
          height: page.viewportSize()!.height - 80,
        },
    path: resolve(shots, `${name}.png`),
    animations: "disabled",
  });
  if (setupState) await page.setViewportSize(previous);
};

type Options = {
  ready?: boolean;
  signedIn?: boolean;
  mic?: string;
  failRead?: boolean;
  failWrite?: boolean;
  output?: string;
  local?: boolean;
  invalidKey?: boolean;
  failKeys?: boolean;
  platform?: string;
};
async function fixtures(page: Page, options: Options = {}) {
  await page.addInitScript((options) => {
    const state = {
      ready: options.ready ?? false,
      signedIn: options.signedIn ?? false,
      mic: options.mic ?? "not-determined",
      accessibility: false,
      failRead: options.failRead ?? false,
      failWrite: options.failWrite ?? false,
      modelFailure: false,
      permissionQueryFailure: false,
      signInFailure: false,
      approve: false,
      holdWrite: false,
      release: null as null | (() => void),
      writes: 0,
      requests: 0,
      checks: 0,
      onboarding: sessionStorage.getItem("test.onboarding"),
    };
    Object.assign(window, { setupFixture: state });
    if (!localStorage.getItem("theme")) localStorage.setItem("theme", "dark");
    const model = () => ({
      id: 1,
      provider: options.local
        ? "local-whisper"
        : state.signedIn
          ? "freestyle-cloud"
          : "openai",
      model_id: options.local ? "local-whisper/tiny" : "openai/whisper-1",
      model_name: options.local ? "Whisper Tiny" : "Whisper",
      type: "voice",
      is_default: 1,
    });
    let currentFetch = window.fetch.bind(window);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      get: () => currentFetch,
      set: (next: typeof fetch) => {
        currentFetch = async (input, init) => {
          const request = new Request(
            input instanceof Request ? input.clone() : input,
            init,
          );
          const path = new URL(request.url).pathname;
          if (path === "/api/settings")
            return state.failRead
              ? Response.json({ error: "Unavailable" }, { status: 503 })
              : Response.json({
                  ...(state.onboarding ? { onboarding: state.onboarding } : {}),
                  output_mode: options.output ?? "clipboard",
                  hotkey: "Alt+Space",
                  hotkey_mode: "toggle",
                });
          if (path === "/api/settings/onboarding" && request.method === "PUT") {
            state.writes++;
            if (state.holdWrite)
              await new Promise<void>((resolve) => {
                state.release = resolve;
              });
            if (state.failWrite)
              return Response.json({ error: "Unavailable" }, { status: 503 });
            state.onboarding = (await request.json()).value;
            sessionStorage.setItem("test.onboarding", state.onboarding!);
            return Response.json({ ok: true });
          }
          if (path === "/api/models/configured")
            return state.modelFailure
              ? Response.json({}, { status: 503 })
              : Response.json(state.ready ? [model()] : []);
          if (path === "/api/keys" && options.failKeys)
            return Response.json({}, { status: 503 });
          if (path === "/api/keys")
            return Response.json(
              state.ready
                ? [
                    {
                      provider: "openai",
                      status: options.invalidKey ? "invalid" : "valid",
                      created_at: "2026-01-01",
                    },
                  ]
                : [],
            );
          if (path === "/api/auth/status")
            return Response.json({
              authenticated: state.signedIn,
              user: state.signedIn
                ? {
                    id: "test-user",
                    name: "Test",
                    email: "sample@example.test",
                  }
                : null,
              verified: true,
            });
          if (path === "/api/auth/device/code")
            return state.signInFailure
              ? Response.json({}, { status: 503 })
              : Response.json({
                  device_code: "test-code",
                  user_code: "TEST-CODE",
                  verification_uri: "https://example.test/sign-in",
                  expires_in: 600,
                  interval: 1,
                });
          if (path === "/api/auth/device/token") {
            if (!state.approve) return Response.json({}, { status: 202 });
            state.signedIn = true;
            state.ready = true;
            return Response.json({
              user: {
                id: "test-user",
                name: "Test",
                email: "sample@example.test",
              },
            });
          }
          return next(input, init);
        };
      },
    });
    if (options.platform === "linux") {
      navigator.permissions.query = async () => {
        if (state.permissionQueryFailure) throw new Error("Unsupported");
        return {
          state:
            state.mic === "granted"
              ? "granted"
              : state.mic === "denied"
                ? "denied"
                : "prompt",
        } as PermissionStatus;
      };
    }
    let api: typeof window.api;
    Object.defineProperty(window, "api", {
      configurable: true,
      get: () => api,
      set: (next: typeof window.api) => {
        api = next;
        if (options.platform)
          Object.assign(api, { platform: options.platform });
        api.checkMicPermission = async () => {
          state.checks++;
          return options.platform === "linux" ? "unknown" : state.mic;
        };
        api.requestMicPermission = async () => {
          state.requests++;
          state.mic = "granted";
          return state.mic;
        };
        api.checkAccessibilityPermission = async () => state.accessibility;
        api.openExternal = async () => {};
      },
    });
  }, options);
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
});

const setup = async (page: Page) => {
  await page.goto("/index.html?scenario=onboarding#/onboarding");
  await page
    .getByRole("button", { name: "Set up local models or API keys" })
    .click();
  await expect(
    page.getByRole("list", { name: "Dictation setup checklist" }),
  ).toBeVisible();
};
const state = (page: Page, values: Record<string, unknown>) =>
  page.evaluate(
    (values) =>
      Object.assign(
        (window as unknown as { setupFixture: Record<string, unknown> })
          .setupFixture,
        values,
      ),
    values,
  );

test("welcome offers two explicit setup paths at desktop and narrow sizes", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/index.html?scenario=onboarding#/onboarding");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Let’s get you ready to dictate.",
  );
  await expect(
    page.getByRole("button", { name: "Sign in with your browser" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { setupFixture: { requests: number } })
          .setupFixture.requests,
    ),
  ).toBe(0);
  await capture(page, "welcome-dark-after");
  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.reload();
  // The fixture boot sets dark; choose light through the real theme preference.
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Let’s get you ready to dictate.",
  );
  await capture(page, "welcome-light-after");
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await page.reload();
  await page.setViewportSize({ width: 640, height: 1100 });
  await expect(
    page.getByRole("button", { name: "Set up local models or API keys" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await capture(page, "welcome-narrow-after");
});

test("guest setup explains missing prerequisites and keeps models within setup", async ({
  page,
}) => {
  await fixtures(page);
  await setup(page);
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Open Freestyle", exact: true }),
  ).toBeDisabled();
  await capture(page, "setup-missing");
  await page.getByRole("button", { name: "Choose model", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Models", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/setup=local&view=models/);
  await capture(page, "setup-models");
  await page
    .getByRole("button", { name: "Back to setup", exact: true })
    .click();
  await expect(
    page.getByRole("list", { name: "Dictation setup checklist" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("list", { name: "Dictation setup checklist" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Finish setup later", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  await page.reload();
  await expect(page).toHaveURL(/#\/today$/);
});

test("permission is requested only on action; practice uses the configured shortcut and clipboard delivery", async ({
  page,
}) => {
  await fixtures(page, { ready: true });
  await setup(page);
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { setupFixture: { requests: number } })
          .setupFixture.requests,
    ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Allow microphone", exact: true })
    .click();
  await expect(
    page.getByText("Ready for a test dictation.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Freestyle", exact: true }),
  ).toBeEnabled();
  await capture(page, "setup-ready");
  await page
    .getByRole("button", { name: "Try dictation", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Practice dictation area" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("textbox", { name: "Practice dictation area" }),
  ).toHaveAttribute("placeholder", /paste your transcript/);
  await expect(page.getByText("Example result", { exact: true })).toBeHidden();
  await capture(page, "setup-practice");
  await page
    .getByRole("button", { name: "Open Freestyle", exact: true })
    .press("Enter");
  await expect(page).toHaveURL(/#\/today$/);
});

test("failed completion retains setup and retries without navigating early or writing twice", async ({
  page,
}) => {
  await fixtures(page, { ready: true, mic: "granted", failWrite: true });
  await setup(page);
  await expect(
    page.getByRole("button", { name: "Open Freestyle", exact: true }),
  ).toBeEnabled();
  await state(page, { holdWrite: true });
  await page
    .getByRole("button", { name: "Open Freestyle", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saving setup…" }),
  ).toBeDisabled();
  await expect(page).toHaveURL(/#\/onboarding\?setup=local$/);
  await page.evaluate(() =>
    (
      window as unknown as { setupFixture: { release: () => void } }
    ).setupFixture.release(),
  );
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t save your setup",
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { setupFixture: { writes: number } }).setupFixture
          .writes,
    ),
  ).toBe(1);
  await capture(page, "setup-save-error");
  await state(page, { holdWrite: false, failWrite: false });
  await page.getByRole("button", { name: "Retry saving setup" }).click();
  await expect(page).toHaveURL(/#\/today$/);
  await page.reload();
  await expect(page).toHaveURL(/#\/today$/);
});

test("settings load failures show retry instead of allowing completion", async ({
  page,
}) => {
  await fixtures(page, { failRead: true });
  await page.goto("/index.html?scenario=onboarding#/onboarding");
  await expect(
    page.getByRole("heading", { name: "Couldn’t load your setup" }),
  ).toBeVisible();
  await state(page, { failRead: false });
  await page.getByRole("button", { name: "Retry loading setup" }).click();
  await expect(
    page.getByRole("button", { name: "Set up local models or API keys" }),
  ).toBeVisible();
});

test("restricted permissions and model failures never report ready and can recover", async ({
  page,
}) => {
  await fixtures(page, { ready: true, mic: "restricted" });
  await setup(page);
  await expect(
    page.getByText(/restricted by your system or administrator/),
  ).toBeVisible();
  await capture(page, "setup-restricted");
  await state(page, { mic: "granted", modelFailure: true });
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry model check" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeDisabled();
  await state(page, { modelFailure: false });
  await page.getByRole("button", { name: "Retry model check" }).click();
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeEnabled();
});

test("a missing local model download cannot be treated as a ready transcription model", async ({
  page,
}) => {
  await fixtures(page, { ready: true, local: true, mic: "granted" });
  await setup(page);
  await expect(
    page.getByText(/Download the selected model and its engine/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeDisabled();
});

test("Cloud sign-in explains the browser handoff, supports cancellation and retry, then continues setup", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/index.html?scenario=onboarding#/onboarding");
  await state(page, { signInFailure: true });
  await page.getByRole("button", { name: "Sign in with your browser" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not start sign-in",
  );
  await state(page, { signInFailure: false });
  await page.getByRole("button", { name: "Try signing in again" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Complete sign-in in your browser",
  );
  await expect(page.getByText("TEST-CODE", { exact: true })).toBeVisible();
  await capture(page, "sign-in-waiting-after");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Set up local models or API keys" })
    .click();
  await state(page, { approve: true });
  await page.waitForTimeout(1200);
  await expect(page).toHaveURL(/setup=local/);
  await page.getByRole("button", { name: "Change setup path" }).click();
  await page.getByRole("button", { name: "Sign in with your browser" }).click();
  await expect(page).toHaveURL(/setup=cloud/);
  await expect(page.getByText(/Freestyle Cloud is selected/)).toBeVisible();
});

test("signed-in setup still offers account-free models and respects text delivery permissions", async ({
  page,
}) => {
  await fixtures(page, {
    signedIn: true,
    ready: true,
    mic: "granted",
    output: "paste",
  });
  await page.goto("/index.html?scenario=onboarding#/onboarding");
  await page
    .getByRole("button", { name: "Continue with Freestyle Cloud" })
    .click();
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeDisabled();
  await state(page, { accessibility: true });
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeEnabled();
});

test("invalid provider credentials are explained before practice", async ({
  page,
}) => {
  await fixtures(page, { ready: true, mic: "granted", invalidKey: true });
  await setup(page);
  await expect(
    page.getByText("Connect or update this provider’s API key in Models."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeDisabled();
});

test("setup is usable at a narrow short viewport with no horizontal overflow", async ({
  page,
}) => {
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 700 });
  await setup(page);
  await expect(page.locator(".glass-sidebar")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Finish setup later", exact: true })
    .press("Enter");
  await expect(page).toHaveURL(/#\/today$/);
});

test("Linux permission stays ready after an explicit grant, recheck and focus", async ({
  page,
}) => {
  await fixtures(page, { ready: true, platform: "linux" });
  await setup(page);
  await page
    .getByRole("button", { name: "Allow microphone", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeEnabled();
  await state(page, { permissionQueryFailure: true });
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeEnabled();
  await state(page, { permissionQueryFailure: false, mic: "not-determined" });
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Allow microphone", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeEnabled();
  await state(page, { mic: "denied" });
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Try dictation", exact: true }),
  ).toBeDisabled();
});

test("a failing key inventory does not block choosing a local model on a fresh installation", async ({
  page,
}) => {
  await fixtures(page, { failKeys: true });
  await setup(page);
  await page.getByRole("button", { name: "Choose model", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Models", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back to setup", exact: true }),
  ).toBeVisible();
});
