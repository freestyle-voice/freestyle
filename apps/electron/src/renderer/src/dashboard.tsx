import "./globals.css";
import "./fonts.css";

import { TooltipProvider } from "@renderer/components/ui/tooltip";
import { initApiBase } from "@renderer/lib/api";
import OnboardingPage from "@renderer/onboarding";
import DictionaryPage from "@renderer/pages/dictionary";
import FormatsPage from "@renderer/pages/formats";
import HistoryPage from "@renderer/pages/history";
import ModelsPage from "@renderer/pages/models";
import NotFoundPage from "@renderer/pages/not-found";
import SettingsPage from "@renderer/pages/settings";
import TodayPage from "@renderer/pages/today";
import VocabularyPage from "@renderer/pages/vocabulary";
import AppShell from "@renderer/shell";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";

function PagePad(): React.JSX.Element {
  return (
    <div className="responsive-route-pad">
      <Outlet />
    </div>
  );
}

// Analytics is captured server-side (see apps/server/src/lib/posthog.ts);
// the renderer ships no analytics SDK.
initApiBase();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/onboarding" element={<OnboardingPage />} />

            <Route element={<AppShell />}>
              <Route path="/today" element={<TodayPage />} />
              <Route element={<PagePad />}>
                <Route path="/settings" element={<SettingsPage />} />
                <Route
                  path="/settings/general"
                  element={<Navigate to="/settings" replace />}
                />
                <Route path="/settings/models" element={<ModelsPage />} />
                <Route
                  path="/settings/dictionary"
                  element={<DictionaryPage />}
                />
                <Route
                  path="/settings/vocabulary"
                  element={<VocabularyPage />}
                />
                <Route path="/settings/formats" element={<FormatsPage />} />
                <Route path="/settings/history" element={<HistoryPage />} />
                <Route
                  path="/settings/permissions"
                  element={<Navigate to="/settings" replace />}
                />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </TooltipProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
