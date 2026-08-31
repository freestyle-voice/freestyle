import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("dashboard startup rendering", () => {
  it("uses a full-window signed-out shell while authentication verifies", async () => {
    const [dashboard, gate, shell] = await Promise.all([
      readFile(resolve(rendererRoot, "dashboard.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "components/login-gate.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "shell.tsx"), "utf8"),
    ]);

    expect(dashboard).toContain("<Route element={<AppShell />}>");
    expect(dashboard).toContain("<ProtectedOutlet />");
    expect(gate).toContain("function StartupContentPlaceholder");
    expect(gate).not.toContain("function AuthLoadingFrame");
    expect(shell).toContain("function SignedOutShell");
    expect(shell).toContain("if (!user) return <SignedOutShell />;");
    expect(shell).toContain(
      'className="glass-content flex min-h-0 min-w-0 flex-1 flex-col"',
    );
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

  it("lets the notification token request establish availability", async () => {
    const [notification, courierSession] = await Promise.all([
      readFile(resolve(rendererRoot, "components/notification.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "lib/courier-session.ts"), "utf8"),
    ]);

    expect(notification).not.toContain("initApiBase();");
    expect(courierSession).toContain("await resolveApiBase();");
    expect(courierSession).not.toContain("await initApiBase();");
  });

  it("shares main-process readiness while startup consumers wait for the server", async () => {
    const main = await readFile(
      resolve(rendererRoot, "../../main/index.ts"),
      "utf8",
    );

    expect(main).toContain(
      "let serverReadyPromise: Promise<boolean> | null = null;",
    );
    expect(main).toContain(
      "if (!getServerUrl()) serverReadyPromise = Promise.resolve(true);",
    );
    expect(main.match(/waitForServerReady\(\)/g)).toHaveLength(2);
    expect(main).not.toContain(
      "for (let attempt = 0; attempt < 20; attempt++)",
    );
  });
});
