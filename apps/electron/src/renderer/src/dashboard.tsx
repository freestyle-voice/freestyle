import "./globals.css";
import "./fonts.css";

import { CloudSignInModal } from "@renderer/components/cloud-signin-modal";
import { ErrorBoundary } from "@renderer/components/error-boundary";
import { LoginGate } from "@renderer/components/login-gate";
import { RemixSessionProvider } from "@renderer/components/remix-session-context";
import { TooltipProvider } from "@renderer/components/ui/tooltip";
import { UpgradeModalProvider } from "@renderer/components/upgrade-modal";
import { usePersistentState } from "@renderer/hooks/use-persistent-state";
import i18n, { initI18n } from "@renderer/i18n";
import { resolveApiBase } from "@renderer/lib/api";
import { CloudAuthProvider } from "@renderer/lib/auth-context";
import { createQueryClient, settingsQueryOptions } from "@renderer/lib/query";
import {
  installGlobalErrorHandlers,
  reportError,
} from "@renderer/lib/report-error";
import {
  DEFAULT_WORKSPACE,
  isWorkspace,
  WORKSPACE_STORAGE_KEY,
  workspaceHomeRoute,
} from "@renderer/lib/workspace";
import HelpPage from "@renderer/pages/help";
import HistoryPage from "@renderer/pages/history";
import NotFoundPage from "@renderer/pages/not-found";
import AppShell from "@renderer/shell";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { lazy, StrictMode, Suspense, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import {
  HashRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router";

// Route-level code splitting: the landing route (Today), the app shell, and the
// tiny not-found page load eagerly; every other page is lazy so the initial
// bundle stays small and each page's chunk loads on navigation.
const DictionaryPage = lazy(() => import("@renderer/pages/dictionary"));
const ModelsPage = lazy(() => import("@renderer/pages/models"));
const PluginDetailPage = lazy(
  () => import("@renderer/pages/plugins/plugin-detail"),
);
const PluginPage = lazy(() => import("@renderer/pages/plugins/plugin-page"));
const PluginsPage = lazy(() => import("@renderer/pages/plugins/plugins"));
const ProfilePage = lazy(() => import("@renderer/pages/profile"));
const RemixPage = lazy(() => import("@renderer/pages/remix-workspace"));
const SettingsPage = lazy(() => import("@renderer/pages/settings"));
const TonePage = lazy(() => import("@renderer/pages/tone"));
const VocabularyPage = lazy(() => import("@renderer/pages/vocabulary"));

const queryClient = createQueryClient();

const THEME_SETTING_KEY = "theme";
const isThemePreference = (
  value: string | undefined,
): value is "light" | "dark" | "system" =>
  value === "light" || value === "dark" || value === "system";

/**
 * Keep the restored settings dialog and next-themes in sync without forcing a
 * color scheme. With no stored choice, next-themes follows macOS/Windows; an
 * explicit light or dark selection remains respected after a restart.
 */
function ThemePreferenceBridge(): React.JSX.Element | null {
  const { data: settings } = useQuery(settingsQueryOptions());
  const { setTheme } = useTheme();
  const appliedPreference = useRef<string | null>(null);
  const preference = settings?.[THEME_SETTING_KEY];

  useEffect(() => {
    if (!isThemePreference(preference)) return;
    if (appliedPreference.current === preference) return;
    setTheme(preference);
    appliedPreference.current = preference;
  }, [preference, setTheme]);

  return null;
}

// Keep the workspace shell and its geometry present while a lazy page chunk
// arrives. The page's own loading state replaces this next; this only covers
// the short gap before that component can mount.
type RouteFallbackCopy = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
};

const PAGE_FALLBACKS: Record<string, RouteFallbackCopy> = {
  "/remix": { title: "Remix" },
  "/dictionary": {
    title: "Shortcuts",
    subtitle: "Shortcuts that expand as you speak. Say the key, get the value.",
  },
  "/vocabulary": { title: "Vocabulary" },
  "/tone": {
    title: "Tone",
    subtitle: "How much Freestyle cleans up — and how it sounds in each app.",
  },
  "/settings/models": { title: "Models" },
  "/help": { title: "Help" },
  "/profile": {
    title: "Profile",
    subtitle: "Manage your account details.",
  },
  "/plugins": {
    title: "Plugins",
    subtitle:
      "Install plugins to add features. Each runs in the dictation pipeline and can ship its own page.",
  },
};

const SETTINGS_FALLBACKS: Record<string, RouteFallbackCopy> = {
  application: { eyebrow: "Settings", title: "Application" },
  companion: { eyebrow: "Settings", title: "Companion" },
  recording: { eyebrow: "Settings", title: "Dictation" },
  remix: { eyebrow: "Settings", title: "Remix" },
  mcp: { eyebrow: "Settings", title: "MCP connections" },
  display: { eyebrow: "Settings", title: "Appearance" },
  permissions: { eyebrow: "Settings", title: "Permissions" },
  data: { eyebrow: "Settings", title: "Data" },
  notifications: { eyebrow: "Settings", title: "Notifications" },
  connectedApps: { eyebrow: "Settings", title: "Connected apps" },
  billing: { eyebrow: "Settings", title: "Usage & billing" },
  network: { eyebrow: "Settings", title: "Network" },
};

function fallbackCopyForPath(pathname: string): RouteFallbackCopy {
  const pageFallback = PAGE_FALLBACKS[pathname];
  if (pageFallback) return pageFallback;

  if (pathname.startsWith("/settings/")) {
    const section = pathname.slice("/settings/".length);
    return SETTINGS_FALLBACKS[section] ?? SETTINGS_FALLBACKS.recording;
  }

  if (pathname.startsWith("/plugins/")) return { title: "Plugin" };

  return { title: "Freestyle" };
}

// This copy intentionally stays local and synchronous. Locale files load after
// mount, so waiting for translated strings here would recreate the blank/skeleton
// gap that this fallback is meant to avoid. The lazy page replaces it as soon as
// its chunk (and its translated content) is available.
function RouteFallback(): React.JSX.Element {
  const { pathname } = useLocation();
  const { eyebrow, title, subtitle } = fallbackCopyForPath(pathname);

  return (
    <div
      aria-busy="true"
      aria-label="Loading page"
      className="dashboard-route-skeleton flex min-h-0 flex-1 flex-col gap-7 px-6 pb-8 pt-12 sm:px-10"
      role="status"
    >
      <div className="max-w-xl">
        {eyebrow ? (
          <p className="text-muted-foreground mono mb-2 text-[10px] font-semibold tracking-[0.16em] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="serif text-foreground m-0 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
          <span className="serif-italic text-primary">{title}</span>
          <span>.</span>
        </h1>
        {subtitle ? (
          <p className="text-muted-foreground mt-2.5 max-w-[580px] text-[14px] leading-[1.5]">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="grid max-w-5xl gap-4 md:grid-cols-2">
        {["first", "second"].map((card) => (
          <div
            key={card}
            className="rounded-xl border border-border/65 bg-card/45 p-5"
          >
            <div className="dashboard-route-skeleton-line h-4 w-32 animate-pulse rounded-full bg-muted/65" />
            <div className="dashboard-route-skeleton-line mt-4 h-3 w-full animate-pulse rounded-full bg-muted/50" />
            <div className="dashboard-route-skeleton-line mt-2 h-3 w-4/5 animate-pulse rounded-full bg-muted/50" />
            <div className="dashboard-route-skeleton-line mt-6 h-9 w-24 animate-pulse rounded-md bg-muted/65" />
          </div>
        ))}
      </div>
    </div>
  );
}

function LazyRoute({
  children,
}: {
  children: React.JSX.Element;
}): React.JSX.Element {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function PagePad(): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Outlet />
    </div>
  );
}

/** Protect route content while AppShell selects the signed-in or signed-out frame. */
function ProtectedOutlet(): React.JSX.Element {
  return (
    <LoginGate>
      <Outlet />
    </LoginGate>
  );
}

/**
 * Resolve the startup route from the same local preference as the sidebar.
 * This keeps a restored Dictate sidebar and its right-hand page in lockstep
 * from the very first render, while direct Remix links still open Remix.
 */
function DashboardHomeRedirect(): React.JSX.Element {
  const [workspace] = usePersistentState(
    WORKSPACE_STORAGE_KEY,
    DEFAULT_WORKSPACE,
    isWorkspace,
  );
  return <Navigate to={workspaceHomeRoute(workspace)} replace />;
}

// Analytics is captured server-side (see apps/server/src/lib/sentry.ts);
// the renderer ships no analytics SDK.
installGlobalErrorHandlers();

// Resolve the target first, then warm the local settings snapshot. A health
// probe is useful for diagnostics but must not delay the visible desktop shell
// or this background fetch.
void resolveApiBase().then(() => {
  void queryClient.prefetchQuery(settingsQueryOptions());
});

// Opt into the translucent "glass" surfaces only on macOS, where the window is
// transparent and backed by native vibrancy. On other platforms the window
// stays opaque, so surfaces remain solid (see globals.css). Set synchronously
// before the first paint to avoid a flash of the wrong background.
if (window.api?.platform === "darwin") {
  document.documentElement.classList.add("glass");
}

function mount(): void {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <I18nextProvider i18n={i18n}>
          <HashRouter>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <QueryClientProvider client={queryClient}>
                <ThemePreferenceBridge />
                <TooltipProvider>
                  <CloudAuthProvider>
                    <RemixSessionProvider>
                      <UpgradeModalProvider>
                        <CloudSignInModal />
                        <Routes>
                          <Route path="/" element={<DashboardHomeRedirect />} />
                          <Route
                            path="/onboarding"
                            element={<Navigate to="/today" replace />}
                          />

                          <Route element={<AppShell />}>
                            <Route element={<ProtectedOutlet />}>
                              <Route path="/today" element={<HistoryPage />} />
                              <Route element={<PagePad />}>
                                <Route
                                  path="/remix"
                                  element={
                                    <LazyRoute>
                                      <RemixPage />
                                    </LazyRoute>
                                  }
                                />
                                <Route
                                  path="/settings"
                                  element={
                                    <Navigate
                                      to="/settings/transcription"
                                      replace
                                    />
                                  }
                                />
                                <Route
                                  path="/settings/:section"
                                  element={
                                    <LazyRoute>
                                      <SettingsPage />
                                    </LazyRoute>
                                  }
                                />
                                <Route
                                  path="/settings/general"
                                  element={
                                    <Navigate
                                      to="/settings/application"
                                      replace
                                    />
                                  }
                                />
                                <Route
                                  path="/models"
                                  element={
                                    <Navigate to="/settings/models" replace />
                                  }
                                />
                                <Route
                                  path="/dictionary"
                                  element={
                                    <LazyRoute>
                                      <DictionaryPage />
                                    </LazyRoute>
                                  }
                                />
                                <Route
                                  path="/vocabulary"
                                  element={
                                    <LazyRoute>
                                      <VocabularyPage />
                                    </LazyRoute>
                                  }
                                />
                                <Route
                                  path="/settings/formats"
                                  element={<Navigate to="/tone" replace />}
                                />
                                <Route
                                  path="/tone"
                                  element={
                                    <LazyRoute>
                                      <TonePage />
                                    </LazyRoute>
                                  }
                                />
                                <Route
                                  path="/settings/models"
                                  element={
                                    <LazyRoute>
                                      <ModelsPage />
                                    </LazyRoute>
                                  }
                                />
                                <Route
                                  path="/settings/dictionary"
                                  element={
                                    <Navigate to="/dictionary" replace />
                                  }
                                />
                                <Route
                                  path="/settings/vocabulary"
                                  element={
                                    <Navigate to="/vocabulary" replace />
                                  }
                                />
                                <Route
                                  path="/settings/tone"
                                  element={<Navigate to="/tone" replace />}
                                />
                                <Route
                                  path="/settings/history"
                                  element={
                                    <Navigate to="/settings/data" replace />
                                  }
                                />
                                <Route
                                  path="/help"
                                  element={
                                    <LazyRoute>
                                      <HelpPage />
                                    </LazyRoute>
                                  }
                                />
                                <Route
                                  path="/profile"
                                  element={
                                    <LazyRoute>
                                      <ProfilePage />
                                    </LazyRoute>
                                  }
                                />
                                <Route
                                  path="/plugins"
                                  element={
                                    <LazyRoute>
                                      <PluginsPage />
                                    </LazyRoute>
                                  }
                                />
                                <Route
                                  path="/plugins/:slug"
                                  element={
                                    <LazyRoute>
                                      <PluginDetailPage />
                                    </LazyRoute>
                                  }
                                />
                                <Route
                                  path="/plugins/:slug/:pageId"
                                  element={
                                    <LazyRoute>
                                      <PluginPage />
                                    </LazyRoute>
                                  }
                                />
                              </Route>
                            </Route>
                          </Route>

                          <Route path="*" element={<NotFoundPage />} />
                        </Routes>
                      </UpgradeModalProvider>
                    </RemixSessionProvider>
                  </CloudAuthProvider>
                </TooltipProvider>
              </QueryClientProvider>
            </ThemeProvider>
          </HashRouter>
        </I18nextProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

// Mount the window frame immediately. Locale content loads independently so a
// cold translation chunk never holds the desktop shell behind a blank window.
mount();

// Locale files are loaded on demand. If this fails, react-i18next renders the
// fallback keys instead of holding startup hostage.
void initI18n().catch((err) => {
  reportError(err, { scope: "initI18n" });
});
