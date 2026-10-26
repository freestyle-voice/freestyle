import { expect, test } from "@playwright/test";

const routes = [
  "/today",
  "/remix",
  "/settings/application",
  "/settings/transcription",
  "/settings/remix",
  "/settings/appearance",
  "/settings/mcp",
  "/settings/permissions",
  "/settings/data",
  "/settings/notifications",
  "/settings/apps",
  "/settings/billing",
  "/settings/network",
  "/settings/models",
  "/dictionary",
  "/vocabulary",
  "/tone",
  "/profile",
  "/plugins",
  "/help",
];

for (const route of routes) {
  test(`renders ${route} without Electron or a backend`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.url().includes("/api/client-error"))
        errors.push(request.postData() ?? "renderer error");
    });
    await page.goto(`/index.html#${route}`);
    await expect(page.getByLabel("Browser development controls")).toBeVisible();
    await expect(page.locator("#root")).not.toBeEmpty();
    const settingsHeadings: Record<string, string> = {
      "/settings/application": "Application",
      "/settings/transcription": "Dictation",
      "/settings/remix": "Remix",
      "/settings/appearance": "Appearance",
      "/settings/permissions": "Permissions",
      "/settings/data": "Data",
      "/settings/apps": "Connected apps",
      "/settings/notifications": "Notifications",
      "/settings/billing": "Usage & billing",
      "/settings/network": "Network",
      "/settings/models": "Models",
      "/settings/mcp": "MCP connections",
    };
    if (settingsHeadings[route])
      await expect(
        page.getByRole("heading", {
          name: settingsHeadings[route],
          exact: true,
          level: 1,
        }),
      ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("Something went wrong", { exact: true }),
    ).toBeHidden();
    expect(await page.evaluate(() => typeof window.electron)).toBe("undefined");
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as {
              freestyleBrowser: {
                diagnostics: { errors: string[]; missingFixtures: string[] };
              };
            }
          ).freestyleBrowser.diagnostics,
      ),
    ).toEqual({ errors: [], missingFixtures: [] });
    await expect(
      page.getByRole("status").filter({ hasText: "Missing fixture" }),
    ).toHaveCount(0);
  });
}

test("fixture settings are writable and isolated from a reload", async ({
  page,
}) => {
  await page.goto("/index.html#/settings/appearance");
  await expect(page.locator("#root")).not.toBeEmpty();
  const result = await page.evaluate(async () => {
    const origin = await window.api.getServerUrl();
    await fetch(`${origin}/api/settings/theme`, {
      method: "PUT",
      body: JSON.stringify({ value: "dark" }),
    });
    return (await (await fetch(`${origin}/api/settings`)).json()).theme;
  });
  expect(result).toBe("dark");
  await page.reload();
  expect(
    await page.evaluate(
      async () => (await (await fetch("/api/settings")).json()).theme,
    ),
  ).toBeUndefined();
});

test("theme controls update the real UI and desktop-only switches are disabled", async ({
  page,
}) => {
  await page.goto("/index.html#/settings/appearance");
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(
    await page.evaluate(
      async () => (await (await fetch("/api/settings")).json()).theme,
    ),
  ).toBe("dark");
  await page.goto("/index.html#/settings/application");
  await expect(page.getByRole("switch")).toHaveCount(3);
  for (const control of await page.getByRole("switch").all())
    await expect(control).toBeDisabled();
  await page.goto("/index.html#/settings/remix");
  await expect(page.getByRole("button", { name: /Change$/ })).toBeDisabled();
});

test("notification preview uses the shared card and can be dismissed", async ({
  page,
}) => {
  await page.goto("/notification.html");
  await expect(page.getByText("Your brief is ready")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.getByText("Your brief is ready")).toHaveCount(0);
});

test.describe("macOS browser", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  });
  test("loads the Mac-specific model status without missing fixtures", async ({
    page,
  }) => {
    await page.goto("/index.html#/settings/models");
    await expect(
      page.getByRole("heading", { level: 1, name: "Models", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        async () => (await fetch("/api/mlx-asr/status")).status,
      ),
    ).toBe(200);
    await expect(
      page.getByRole("status").filter({ hasText: "Missing fixture" }),
    ).toHaveCount(0);
  });
});

test("shows empty, loading, error and onboarding scenarios", async ({
  page,
}) => {
  await page.goto("/index.html?scenario=loading#/vocabulary");
  await expect(page.getByLabel("Loading entries")).toBeVisible();
  await page.goto("/index.html?scenario=error#/vocabulary");
  await expect(page.locator("[role=alert]")).toBeVisible();
  await page.getByLabel("Preview scenario").selectOption("empty");
  await expect(page.getByLabel("Loading entries")).toHaveCount(0);
  await expect(page.locator("[role=alert]")).toHaveCount(0);
  await page.goto("/index.html?scenario=onboarding");
  await expect(page).toHaveURL(/#\/onboarding$/);
});

test("reports unavailable native actions instead of claiming success", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#root")).not.toBeEmpty();
  expect(await page.evaluate(() => window.api.remixSelectAll())).toEqual({
    ok: false,
    reason: "desktop_required",
  });
  await page.evaluate(() => window.api.installUpdate());
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "App updates requires the desktop application" }),
  ).toBeVisible();
});

for (const surface of ["panel", "pill", "notification"]) {
  test(`boots the ${surface} surface`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/${surface}.html`);
    await expect(page.locator("#root")).not.toBeEmpty();
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
}

test("uses the authenticated standalone server through the browser proxy", async ({
  page,
  request,
}) => {
  // The backend requires a token, while browser requests carry none.
  expect(
    (await request.get("http://127.0.0.1:4651/api/settings")).status(),
  ).toBe(401);
  await page.goto("http://127.0.0.1:5174/index.html#/settings/application");
  await expect(page.locator("#root")).not.toBeEmpty();
  const result = await page.evaluate(async () => {
    const before = await fetch("/api/settings");
    const write = await fetch("/api/settings/browser_e2e", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "works" }),
    });
    const after = await (await fetch("/api/settings")).json();
    return {
      before: before.status,
      write: write.status,
      stored: after.browser_e2e,
      token: await window.api.getServerToken(),
    };
  });
  expect(result).toEqual({
    before: 200,
    write: 200,
    stored: "works",
    token: "",
  });
  expect(
    (
      await request.get("http://127.0.0.1:5174/api/settings", {
        headers: { Origin: "https://example.test" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get(
        "http://127.0.0.1:5174/api/plugins/example/ui/index.html",
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get(
        "http://127.0.0.1:5173/api/plugins/example/ui/index.html",
      )
    ).status(),
  ).toBe(403);
  const mcpRequests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/mcp/")) mcpRequests.push(req.url());
  });
  await page.goto("http://127.0.0.1:5174/index.html#/settings/mcp");
  await expect(
    page.getByRole("heading", {
      name: "MCP connections",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect.poll(() => mcpRequests.length).toBeGreaterThan(0);
  expect(
    mcpRequests.every((url) => new URL(url).origin === "http://127.0.0.1:5174"),
  ).toBe(true);
  const websocket = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const socket = new WebSocket("ws://127.0.0.1:5174/stream");
        const timer = setTimeout(() => {
          socket.close();
          resolve("timeout");
        }, 5000);
        socket.onmessage = (event) => {
          clearTimeout(timer);
          socket.close();
          resolve(String(event.data));
        };
        socket.onerror = () => {
          clearTimeout(timer);
          resolve("error");
        };
      }),
  );
  expect(websocket).toMatch(/^\{"type":"(config|error)"/);
});
