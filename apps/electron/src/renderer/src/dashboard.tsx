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
import { initApiBase } from "@renderer/lib/api";
import { CloudAuthProvider } from "@renderer/lib/auth-context";
import { listPlugins } from "@renderer/lib/plugins-api";
import {
  createQueryClient,
  queryKeys,
  settingsQueryOptions,
} from "@renderer/lib/query";
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
import { HashRouter, Navigate, Outlet, Route, Routes } from "react-router";

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

// Neutral fallback while a route chunk loads — pages render their own loading
// states, so this only shows for the brief chunk fetch.
function RouteFallback(): React.JSX.Element {
  return <div className="min-h-0 flex-1" />;
}

function PagePad(): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Outlet />
    </div>
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

// Analytics is captured server-side (see apps/server/src/lib/posthog.ts);
// the renderer ships no analytics SDK.
installGlobalErrorHandlers();

// Resolve the server base, then warm the auth-independent content queries. The
// content subtree (AppShell + pages) only mounts once auth resolves, so its
// queries would otherwise wait for GET /api/auth/status before even starting —
// serializing the whole panel behind auth. Prefetching here races the auth
// check, so settings + plugins are cached or in-flight by the time the subtree
// mounts. Failures are swallowed — the real useQuery hooks retry on mount.
void initApiBase().then(() => {
  void queryClient.prefetchQuery(settingsQueryOptions());
  void queryClient.prefetchQuery({
    queryKey: queryKeys.plugins,
    queryFn: () => listPlugins(),
  });
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
                        <Suspense fallback={<RouteFallback />}>
                          <Routes>
                            <Route
                              path="/"
                              element={<DashboardHomeRedirect />}
                            />
                            <Route
                              path="/onboarding"
                              element={<Navigate to="/today" replace />}
                            />

                            <Route
                              element={
                                <LoginGate>
                                  <AppShell />
                                </LoginGate>
                              }
                            >
                              <Route path="/today" element={<HistoryPage />} />
                              <Route element={<PagePad />}>
                                <Route path="/remix" element={<RemixPage />} />
                                <Route
                                  path="/settings"
                                  element={<SettingsPage />}
                                />
                                <Route
                                  path="/settings/general"
                                  element={<Navigate to="/settings" replace />}
                                />
                                <Route
                                  path="/settings/models"
                                  element={<ModelsPage />}
                                />
                                <Route
                                  path="/settings/dictionary"
                                  element={<DictionaryPage />}
                                />
                                <Route
                                  path="/settings/vocabulary"
                                  element={<VocabularyPage />}
                                />
                                <Route
                                  path="/settings/formats"
                                  element={
                                    <Navigate to="/settings/tone" replace />
                                  }
                                />
                                <Route
                                  path="/settings/tone"
                                  element={<TonePage />}
                                />
                                <Route
                                  path="/settings/history"
                                  element={<Navigate to="/today" replace />}
                                />
                                <Route path="/help" element={<HelpPage />} />
                                <Route
                                  path="/profile"
                                  element={<ProfilePage />}
                                />
                                <Route
                                  path="/plugins"
                                  element={<PluginsPage />}
                                />
                                <Route
                                  path="/plugins/:slug"
                                  element={<PluginDetailPage />}
                                />
                                <Route
                                  path="/plugins/:slug/:pageId"
                                  element={<PluginPage />}
                                />
                                <Route
                                  path="/settings/permissions"
                                  element={<Navigate to="/settings" replace />}
                                />
                              </Route>
                            </Route>

                            <Route path="*" element={<NotFoundPage />} />
                          </Routes>
                        </Suspense>
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
