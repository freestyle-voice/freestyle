import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const baseline = process.env.UI_RECOVERY_BASELINE === "1";
const assets = resolve(process.cwd(), "../../specs/assets/ui-recovery");

async function fixtures(page: Page, failure: string) {
  await page.addInitScript(
    ({ failure }) => {
      const state = {
        fail: true,
        loadFail: true,
        reads: 0,
        writes: 0,
        text: "- [ ] Review the release\n",
        enabled: true,
        installed: true,
        hold: false,
        networkValues: [] as string[],
        release: undefined as (() => void) | undefined,
      };
      Object.assign(window, { recoveryFixture: state });
      const plugin = () => ({
        name: "review-helper",
        slug: "review-helper",
        specifier: "review-helper",
        enabled: state.enabled,
        version: "1.0.0",
        description: "Prepare release notes from your dictation.",
        pages: [],
        readme: "## Release helper\nKeep your release notes organized.",
      });
      // Wrap the fixture fetch assigned by the browser entry before React mounts.
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
            if (
              failure === "network" &&
              path.includes("/api/settings/network_")
            ) {
              state.writes++;
              if (state.hold) {
                state.hold = false;
                await new Promise<void>((resolve) => {
                  state.release = resolve;
                });
              }
              state.networkValues.push((await request.clone().json()).value);
              if (state.fail)
                return Response.json(
                  { error: "Could not apply network settings." },
                  { status: 503 },
                );
            }
            if (failure === "billing" && path === "/api/usage") {
              state.reads++;
              return state.fail
                ? Response.json({ error: "Unavailable" }, { status: 503 })
                : Response.json({
                    plan: "pro",
                    unlimited: true,
                    remaining: 0,
                    limit: 0,
                    resetsAt: "2030-01-01T00:00:00Z",
                  });
            }
            if (failure === "plugins" && path === "/api/plugins") {
              state.reads++;
              if (state.fail && state.loadFail)
                return Response.json({ error: "Unavailable" }, { status: 503 });
              return Response.json({
                plugins: state.installed ? [plugin()] : [],
              });
            }
            if (failure === "plugins" && path === "/api/plugins/check-updates")
              return Response.json({
                updates: [
                  {
                    name: "review-helper",
                    updateAvailable: true,
                    latestVersion: "1.1.0",
                  },
                ],
              });
            if (
              failure === "plugins" &&
              ["/api/plugins/install", "/api/plugins/uninstall"].includes(path)
            ) {
              state.writes++;
              if (!state.fail && path === "/api/plugins/uninstall")
                state.installed = false;
              return state.fail
                ? Response.json(
                    { error: "Could not reach the plugin registry." },
                    { status: 503 },
                  )
                : Response.json({ ok: true });
            }
            if (
              failure === "plugins" &&
              path === "/api/settings/disabled_plugins" &&
              request.method === "PUT"
            ) {
              if (state.fail)
                return Response.json({ error: "Unavailable" }, { status: 503 });
              state.enabled = !JSON.parse(
                (await request.clone().json()).value,
              ).includes("review-helper");
            }
            if (failure === "plugins" && path === "/api/plugins/reload")
              return Response.json({ ok: true });
            if (failure === "tasks" && path === "/api/brain/read")
              return Response.json({ ok: true, text: state.text, version: 1 });
            if (failure === "tasks" && path === "/api/brain/write") {
              state.writes++;
              await new Promise((resolve) => setTimeout(resolve, 350));
              if (state.fail)
                return Response.json({ ok: false }, { status: 503 });
              state.text = (await request.json()).text;
              return Response.json({ ok: true, version: 2 });
            }
            if (
              failure === "notifications" &&
              path === "/api/notifications/token"
            ) {
              state.reads++;
              return Response.json(
                { error: "Unavailable" },
                { status: state.fail ? 503 : 401 },
              );
            }
            if (path === "/api/scheduled/tasks") {
              if (request.method === "POST")
                return Response.json(
                  { error: "Couldn’t save this schedule. Try again." },
                  { status: 503 },
                );
              return Response.json({ tasks: [] });
            }
            return next(input, init);
          };
        },
      });
      if (failure === "permissions") {
        let api: typeof window.api;
        Object.defineProperty(window, "api", {
          configurable: true,
          get: () => api,
          set: (value: typeof window.api) => {
            api = value;
            api.checkMicPermission = async () => "restricted";
            api.requestMicPermission = async () => {
              state.writes++;
              return "restricted";
            };
          },
        });
      }
    },
    { failure },
  );
}

async function recover(page: Page) {
  await page.evaluate(() => {
    (
      window as unknown as { recoveryFixture: { fail: boolean } }
    ).recoveryFixture.fail = false;
  });
}

async function capture(page: Page, name: string) {
  await page.screenshot({
    path: resolve(assets, `${name}-${baseline ? "before" : "after"}.png`),
    animations: "disabled",
  });
}

test("network settings retain failed drafts and retry them", async ({
  page,
}) => {
  await fixtures(page, "network");
  await page.goto("/index.html#/settings/network");
  const input = page.locator("#settings-network-proxy");
  await input.fill("http://proxy.example.test:8080");
  await input.blur();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { recoveryFixture: { writes: number } })
            .recoveryFixture.writes,
      ),
    )
    .toBe(1);
  await capture(page, "network-save");
  if (baseline) return;
  await expect(page.getByRole("alert")).toContainText("wasn’t saved");
  await expect(input).toHaveValue("http://proxy.example.test:8080");
  await recover(page);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
});

test("billing distinguishes unknown membership from Free and retries", async ({
  page,
}) => {
  await fixtures(page, "billing");
  await page.goto("/index.html#/settings/billing");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { recoveryFixture: { reads: number } })
            .recoveryFixture.reads,
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await expect(page.getByText("Checking your membership…")).toBeHidden();
  await capture(page, "billing-unavailable");
  if (baseline) return;
  await expect(page.getByText("Couldn’t verify your plan")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Upgrade|Get Pro|Subscribe/ }),
  ).toHaveCount(0);
  await recover(page);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Couldn’t verify your plan")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Pro membership" }),
  ).toBeVisible();
});

test("plugin loading and updates expose recoverable failures", async ({
  page,
}) => {
  await fixtures(page, "plugins");
  await page.goto("/index.html#/plugins/review-helper");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { recoveryFixture: { reads: number } })
            .recoveryFixture.reads,
      ),
    )
    .toBe(2);
  if (baseline) {
    await capture(page, "plugin-unavailable");
    return;
  }
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t load this plugin",
  );
  await capture(page, "plugin-unavailable");
  await page.evaluate(() => {
    (
      window as unknown as { recoveryFixture: { loadFail: boolean } }
    ).recoveryFixture.loadFail = false;
  });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not reach the plugin registry",
  );
  await capture(page, "plugin-operation");
  await recover(page);
  await page
    .getByRole("alert")
    .getByRole("button", { name: "Try again" })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("task additions survive failed writes and retry without duplication", async ({
  page,
}) => {
  await fixtures(page, "tasks");
  await page.goto("/index.html#/remix");
  await page.getByRole("button", { name: /^Tasks/ }).click();
  const inspector = page.getByRole("complementary", {
    name: "Context inspector",
  });
  const input = inspector.getByRole("textbox", { name: "Add a task" });
  await input.fill("Check the release notes");
  await input.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { recoveryFixture: { writes: number } })
            .recoveryFixture.writes,
      ),
    )
    .toBe(1);
  if (baseline) {
    await page.waitForTimeout(500);
    await capture(page, "tasks-save");
    return;
  }
  await expect(inspector.getByRole("alert")).toContainText("Couldn’t save");
  await expect(input).toHaveValue("Check the release notes");
  await capture(page, "tasks-save");
  await recover(page);
  await inspector.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(
    inspector.getByText("Check the release notes", { exact: true }),
  ).toHaveCount(1);
});

test("restricted microphone access explains the next step", async ({
  page,
}) => {
  await fixtures(page, "permissions");
  await page.goto("/index.html#/settings/permissions");
  await expect(
    page.getByRole("heading", { name: "Permissions", exact: true }),
  ).toBeVisible();
  if (baseline) {
    await expect(
      page.locator("main").getByText("Needed", { exact: true }).first(),
    ).toBeVisible();
    await capture(page, "permissions-restricted");
    return;
  }
  await expect(page.getByText("Restricted", { exact: true })).toBeVisible();
  await expect(page.getByText(/system or administrator/)).toBeVisible();
  await capture(page, "permissions-restricted");
  await expect(
    page.getByRole("button", { name: "Allow", exact: true }),
  ).toHaveCount(0);
});

test("notification failures have Retry and signed-out history has Sign in", async ({
  page,
}) => {
  await fixtures(page, "notifications");
  await page.goto("/index.html#/settings/notifications");
  await expect(page.getByText(/Couldn't reach Freestyle Cloud/)).toBeVisible();
  await capture(page, "notifications-unavailable");
  if (baseline) return;
  await recover(page);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("Sign in to see your notifications."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

test("schedule creation explains timing and previews advanced cron", async ({
  page,
}) => {
  await fixtures(page, "schedules");
  await page.goto("/index.html#/remix");
  await page.getByRole("button", { name: "Schedules", exact: true }).click();
  await page.getByRole("button", { name: "New schedule", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New schedule" });
  await dialog.getByLabel("Name", { exact: true }).fill("Morning brief");
  await dialog
    .getByLabel("Schedule, in your words")
    .fill("every weekday at 8am");
  if (baseline) {
    await capture(page, "schedule-timing");
    return;
  }
  await expect(dialog.getByText(/Freestyle interprets/)).toBeVisible();
  await capture(page, "schedule-natural");
  await dialog.getByText("Advanced timing", { exact: true }).click();
  await dialog.getByLabel("Cron expression").fill("0 8 * * 1-5");
  await dialog.getByLabel("Timezone", { exact: true }).fill("Asia/Kolkata");
  await expect(dialog.getByRole("status")).toContainText("Next scheduled time");
  await expect(dialog.getByRole("status")).toContainText("Asia/Kolkata");
  await capture(page, "schedule-timing");
  await dialog.getByLabel("Cron expression").fill("bad cron");
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
});

test("a slow network save cannot overwrite a later reset to the saved value", async ({
  page,
}) => {
  test.skip(baseline);
  await fixtures(page, "network");
  await page.goto("/index.html#/settings/network");
  await recover(page);
  await page.evaluate(() => {
    (
      window as unknown as { recoveryFixture: { hold: boolean } }
    ).recoveryFixture.hold = true;
  });
  const input = page.locator("#settings-network-proxy");
  await input.fill("http://proxy.example.test:8080");
  await input.blur();
  await expect(page.getByText("Saving…", { exact: true })).toBeVisible();
  await input.fill("");
  await input.blur();
  await page.evaluate(() => {
    (
      window as unknown as { recoveryFixture: { release?: () => void } }
    ).recoveryFixture.release?.();
  });
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { recoveryFixture: { networkValues: string[] } })
          .recoveryFixture.networkValues,
    ),
  ).toEqual(["http://proxy.example.test:8080", ""]);
  await expect(input).toHaveValue("");
});

test("failed task toggles keep the saved state and share drafts between views", async ({
  page,
}) => {
  test.skip(baseline);
  await fixtures(page, "tasks");
  await page.goto("/index.html#/remix");
  const card = page.locator('[data-context-kind="tasks"]');
  await card
    .getByRole("textbox", { name: "Add a task" })
    .fill("A draft to keep");
  await page.getByRole("button", { name: /^Tasks/ }).click();
  const inspector = page.getByRole("complementary", {
    name: "Context inspector",
  });
  await expect(
    inspector.getByRole("textbox", { name: "Add a task" }),
  ).toHaveValue("A draft to keep");
  const checkbox = inspector.getByRole("checkbox", {
    name: "Review the release",
  });
  await checkbox.click();
  await expect(checkbox).toBeDisabled();
  await expect(inspector.getByRole("alert")).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  await recover(page);
  await inspector.getByRole("button", { name: "Retry" }).click();
  await expect(checkbox).toBeChecked();
  await expect(
    inspector.getByRole("textbox", { name: "Add a task" }),
  ).toHaveValue("A draft to keep");
});

test("known Pro membership remains visible after a failed refresh", async ({
  page,
}) => {
  test.skip(baseline);
  await fixtures(page, "billing");
  await page.goto("/index.html#/settings/billing");
  await expect(page.getByText("Couldn’t verify your plan")).toBeVisible();
  await recover(page);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Pro membership" }),
  ).toBeVisible();
  await page.evaluate(() => {
    (
      window as unknown as { recoveryFixture: { fail: boolean } }
    ).recoveryFixture.fail = true;
    window.api.sendTranscriptionDone?.();
  });
  await expect(page.getByRole("alert")).toContainText(
    "last verified membership",
  );
  await expect(
    page.getByRole("region", { name: "Pro membership" }),
  ).toBeVisible();
});

test("plugin toggles and uninstall failures can be retried", async ({
  page,
}) => {
  test.skip(baseline);
  await fixtures(page, "plugins");
  await page.goto("/index.html#/plugins/review-helper");
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t load this plugin",
  );
  await recover(page);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Enabled", exact: true });
  await expect(toggle).toBeChecked();
  await page.evaluate(() => {
    (
      window as unknown as { recoveryFixture: { fail: boolean } }
    ).recoveryFixture.fail = true;
  });
  await toggle.click();
  await expect(page.getByRole("alert")).toContainText(
    "failed to persist plugin state",
  );
  await expect(toggle).toBeChecked();
  await recover(page);
  await page
    .getByRole("alert")
    .getByRole("button", { name: "Try again" })
    .click();
  await expect(
    page.getByRole("switch", { name: "Disabled", exact: true }),
  ).not.toBeChecked();
  await page.evaluate(() => {
    (
      window as unknown as { recoveryFixture: { fail: boolean } }
    ).recoveryFixture.fail = true;
  });
  await page.getByRole("button", { name: "Uninstall", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Uninstall", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not reach the plugin registry",
  );
  await recover(page);
  await page
    .getByRole("alert")
    .getByRole("button", { name: "Try again" })
    .click();
  await expect(page).toHaveURL(/#\/plugins$/);
});

test("schedule save errors stay inside the editor with the draft", async ({
  page,
}) => {
  test.skip(baseline);
  await fixtures(page, "schedules");
  await page.goto("/index.html#/remix");
  await page.getByRole("button", { name: "Schedules", exact: true }).click();
  await page.getByRole("button", { name: "New schedule", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New schedule" });
  await dialog.getByLabel("Name", { exact: true }).fill("Release brief");
  await dialog
    .getByLabel("Schedule, in your words")
    .fill("every Friday morning");
  await dialog
    .getByLabel("What Freestyle does")
    .fill("Summarize release notes");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Couldn’t save this schedule",
  );
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
    "Release brief",
  );
  await capture(page, "schedule-save-error");
});

test("recovery feedback remains usable in narrow dark settings", async ({
  page,
}) => {
  test.skip(baseline);
  await fixtures(page, "network");
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/index.html#/settings/network");
  const input = page.locator("#settings-network-proxy");
  await input.fill("http://proxy.example.test:8080");
  await input.blur();
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(page.locator("html")).toHaveClass(/dark/);
  await retry.scrollIntoViewIfNeeded();
  await expect(retry).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await capture(page, "network-narrow-dark");
});
