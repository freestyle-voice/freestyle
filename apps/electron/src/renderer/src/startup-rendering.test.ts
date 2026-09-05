import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("dashboard startup rendering", () => {
  it("keeps the application shell and page data mounted while authentication verifies", async () => {
    const [dashboard, gate, shell] = await Promise.all([
      readFile(resolve(rendererRoot, "dashboard.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "components/login-gate.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "shell.tsx"), "utf8"),
    ]);

    expect(dashboard).toContain("<Route element={<AppShell />}>");
    expect(dashboard).toContain("<ProtectedOutlet />");
    expect(gate).not.toContain("StartupContentPlaceholder");
    expect(gate).toContain('if (phase === "signed_out") return <LoginPage />;');
    expect(shell).toContain("function SignedOutShell");
    expect(shell).toContain(
      'if (phase === "signed_out") return <SignedOutShell />;',
    );
    expect(shell).toContain(
      'className="glass-content relative flex min-h-0 min-w-0 flex-1 flex-col"',
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

  it("keeps a shaped page frame visible while a lazy route chunk loads", async () => {
    const dashboard = await readFile(
      resolve(rendererRoot, "dashboard.tsx"),
      "utf8",
    );

    expect(dashboard).toContain("function RouteFallback");
    expect(dashboard).toContain('aria-label="Loading page"');
    expect(dashboard).toContain("dashboard-route-skeleton");
    expect(dashboard).toContain("dashboard-route-skeleton-line");
    expect(dashboard).toContain("const SETTINGS_FALLBACKS");
    expect(dashboard).toContain('title: "Shortcuts"');
    expect(dashboard).toContain('title: "Vocabulary"');
    expect(dashboard).toContain('title: "Plugins"');
    expect(dashboard).toContain('title: "Profile"');
    expect(dashboard).not.toContain(
      'return <div className="min-h-0 flex-1" />;',
    );
  });

  it("uses shaped loading states instead of centered loading copy for content pages", async () => {
    const [dictionary, vocabulary, tone] = await Promise.all(
      ["dictionary.tsx", "vocabulary.tsx", "tone.tsx"].map((file) =>
        readFile(resolve(rendererRoot, "pages", file), "utf8"),
      ),
    );

    for (const page of [dictionary, vocabulary]) {
      expect(page).toContain("DictionaryLikeEntriesSkeleton");
      expect(page).toContain(
        "loading || !(total === 0 && !search && !showForm)",
      );
      expect(page).not.toContain("return <DictionaryLike");
      expect(page).not.toMatch(/t\("(?:dictionary|vocabulary)\.loading"\)/);
    }

    expect(tone).toContain("TonePageLoadingSkeleton");
    expect(tone).not.toContain('t("tone.loading")');
  });

  it("starts read-only data queries while authentication is still checking", async () => {
    const [api, auth, history, panel, sessions, shell, upgrade] =
      await Promise.all([
        readFile(resolve(rendererRoot, "lib/api.ts"), "utf8"),
        readFile(resolve(rendererRoot, "lib/auth-context.tsx"), "utf8"),
        readFile(resolve(rendererRoot, "pages/history.tsx"), "utf8"),
        readFile(resolve(rendererRoot, "components/panel.tsx"), "utf8"),
        readFile(
          resolve(rendererRoot, "components/remix-session-context.tsx"),
          "utf8",
        ),
        readFile(resolve(rendererRoot, "shell.tsx"), "utf8"),
        readFile(resolve(rendererRoot, "components/upgrade-modal.tsx"), "utf8"),
      ]);

    expect(api).toContain("export function subscribeToUnauthorized");
    expect(api).toContain("fetch: resolvedClientFetch");
    expect(auth).toContain("subscribeToUnauthorized");
    expect(auth).toContain("resetAccountCaches(queryClient)");
    expect(auth).toContain("refetchInterval");
    expect(auth).toContain("enabled: !forcedSignedOut");
    expect(sessions).toContain("enabled: canRequestData");
    expect(shell).toContain("enabled: canRequestData");
    expect(sessions).toContain(
      "const { canRequestData, phase } = useCloudAuth();",
    );
    expect(history).toContain('aria-label="Loading transcription history"');
    expect(history).toContain("{searchRow}");
    expect(panel).toContain("RemixWorkspaceLoadingSkeleton");
    expect(panel).toContain('aria-label="Loading conversation"');
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
