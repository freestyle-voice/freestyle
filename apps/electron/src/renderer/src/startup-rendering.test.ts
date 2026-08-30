import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("dashboard startup rendering", () => {
  it("renders the application shell while authentication verifies in the background", async () => {
    const [dashboard, gate] = await Promise.all([
      readFile(resolve(rendererRoot, "dashboard.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "components/login-gate.tsx"), "utf8"),
    ]);

    expect(dashboard).toContain("<Route element={<AppShell />}>");
    expect(dashboard).toContain("<ProtectedOutlet />");
    expect(gate).toContain("function StartupContentPlaceholder");
    expect(gate).not.toContain("function AuthLoadingFrame");
  });

  it("resolves the configured API target before auth and background queries", async () => {
    const [api, auth, dashboard] = await Promise.all([
      readFile(resolve(rendererRoot, "lib/api.ts"), "utf8"),
      readFile(resolve(rendererRoot, "lib/auth-context.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "dashboard.tsx"), "utf8"),
    ]);

    expect(api).toContain("export async function resolveApiBase");
    expect(auth).toContain("await resolveApiBase();");
    expect(dashboard).toContain("void resolveApiBase().then(() =>");
    expect(dashboard).not.toContain("void initApiBase().then(() =>");
  });

  it("does not start account-only data queries until authentication resolves", async () => {
    const [sessions, shell, upgrade] = await Promise.all([
      readFile(
        resolve(rendererRoot, "components/remix-session-context.tsx"),
        "utf8",
      ),
      readFile(resolve(rendererRoot, "shell.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "components/upgrade-modal.tsx"), "utf8"),
    ]);

    expect(sessions).toContain("enabled: !loading && !!user");
    expect(shell).toContain("enabled: !authLoading && !!user");
    expect(upgrade).toContain("useCheckoutState");
    expect(upgrade).toContain('open || checkoutStatus === "pending"');
  });
});
