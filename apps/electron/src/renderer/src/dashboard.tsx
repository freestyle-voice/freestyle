import "./globals.css";
import "./fonts.css";

import { CloudSignInModal } from "@renderer/components/cloud-signin-modal";
import { ErrorBoundary } from "@renderer/components/error-boundary";
import { TooltipProvider } from "@renderer/components/ui/tooltip";
import i18n from "@renderer/i18n";
import { initApiBase } from "@renderer/lib/api";
import { CloudAuthProvider } from "@renderer/lib/auth-context";
import { installGlobalErrorHandlers } from "@renderer/lib/report-error";
import OnboardingPage from "@renderer/onboarding";
import DictionaryPage from "@renderer/pages/dictionary";
import HelpPage from "@renderer/pages/help";
import HistoryPage from "@renderer/pages/history";
import ModelsPage from "@renderer/pages/models";
import NotFoundPage from "@renderer/pages/not-found";
import PluginDetailPage from "@renderer/pages/plugins/plugin-detail";
import PluginPage from "@renderer/pages/plugins/plugin-page";
import PluginsPage from "@renderer/pages/plugins/plugins";
import SettingsPage from "@renderer/pages/settings";
import TodayPage from "@renderer/pages/today";
import TonePage from "@renderer/pages/tone";
import VocabularyPage from "@renderer/pages/vocabulary";
import AppShell from "@renderer/shell";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Avoid refetching on window focus in a desktop app — the user may
      // switch back and forth between the dashboard and other apps frequently.
      refetchOnWindowFocus: false,
    },
  },
});

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
                  <CloudSignInModal />
                  <Routes>
                    <Route
                      path="/"
                      element={<Navigate to="/today" replace />}
                    />
                    <Route path="/onboarding" element={<OnboardingPage />} />

                    <Route element={<AppShell />}>
                      <Route path="/today" element={<TodayPage />} />
                      <Route element={<PagePad />}>
                        <Route path="/settings" element={<SettingsPage />} />
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
                          element={<Navigate to="/settings" replace />}
                        />
                        <Route path="/settings/tone" element={<TonePage />} />
                        <Route
                          path="/settings/history"
                          element={<HistoryPage />}
                        />
                        <Route path="/help" element={<HelpPage />} />
                        <Route path="/plugins" element={<PluginsPage />} />
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
                </CloudAuthProvider>
              </TooltipProvider>
            </QueryClientProvider>
          </ThemeProvider>
        </BrowserRouter>
      </I18nextProvider>
    </ErrorBoundary>
  </StrictMode>,
);
