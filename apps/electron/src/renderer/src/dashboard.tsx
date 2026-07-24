import "./globals.css";
import "./fonts.css";

import { CloudSignInModal } from "@renderer/components/cloud-signin-modal";
import { ErrorBoundary } from "@renderer/components/error-boundary";
import { SessionExpiredModal } from "@renderer/components/session-expired-modal";
import { TooltipProvider } from "@renderer/components/ui/tooltip";
import { UpgradeModalProvider } from "@renderer/components/upgrade-modal";
import i18n, { initI18n } from "@renderer/i18n";
import { initApiBase } from "@renderer/lib/api";
import { CloudAuthProvider } from "@renderer/lib/auth-context";
import { createQueryClient } from "@renderer/lib/query";
import {
  installGlobalErrorHandlers,
  reportError,
} from "@renderer/lib/report-error";
import NotFoundPage from "@renderer/pages/not-found";
import TodayPage from "@renderer/pages/today";
import AppShell from "@renderer/shell";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";

// Route-level code splitting: the landing route (Today), the app shell, and the
// tiny not-found page load eagerly; every other page is lazy so the initial
// bundle stays small and each page's chunk loads on navigation.
const OnboardingPage = lazy(() => import("@renderer/onboarding"));
const DictionaryPage = lazy(() => import("@renderer/pages/dictionary"));
const HelpPage = lazy(() => import("@renderer/pages/help"));
const HistoryPage = lazy(() => import("@renderer/pages/history"));
const ModelsPage = lazy(() => import("@renderer/pages/models"));
const PluginDetailPage = lazy(
  () => import("@renderer/pages/plugins/plugin-detail"),
);
const PluginPage = lazy(() => import("@renderer/pages/plugins/plugin-page"));
const PluginsPage = lazy(() => import("@renderer/pages/plugins/plugins"));
const SettingsPage = lazy(() => import("@renderer/pages/settings"));
const TonePage = lazy(() => import("@renderer/pages/tone"));
const VocabularyPage = lazy(() => import("@renderer/pages/vocabulary"));

const queryClient = createQueryClient();

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

// Analytics is captured server-side (see apps/server/src/lib/posthog.ts);
// the renderer ships no analytics SDK.
initApiBase();
installGlobalErrorHandlers();

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
          <BrowserRouter>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <QueryClientProvider client={queryClient}>
                <TooltipProvider>
                  <CloudAuthProvider>
                    <UpgradeModalProvider>
                      <CloudSignInModal />
                      <SessionExpiredModal />
                      <Suspense fallback={<RouteFallback />}>
                        <Routes>
                          <Route
                            path="/"
                            element={<Navigate to="/today" replace />}
                          />
                          <Route
                            path="/onboarding"
                            element={<OnboardingPage />}
                          />

                          <Route element={<AppShell />}>
                            <Route path="/today" element={<TodayPage />} />
                            <Route element={<PagePad />}>
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
                                element={<HistoryPage />}
                              />
                              <Route path="/help" element={<HelpPage />} />
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
                  </CloudAuthProvider>
                </TooltipProvider>
              </QueryClientProvider>
            </ThemeProvider>
          </BrowserRouter>
        </I18nextProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

// Load the active language (and the `en` fallback) before the first paint so
// the UI renders translated immediately. Locale files are no longer bundled
// into the initial chunk — they load on demand per language. If loading fails
// we still mount (i18next falls back to raw keys) rather than leave a blank
// window.
void initI18n()
  .catch((err) => {
    reportError(err, { scope: "initI18n" });
  })
  .finally(mount);
