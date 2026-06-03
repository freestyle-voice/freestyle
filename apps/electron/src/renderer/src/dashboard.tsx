import "./globals.css";
import "./fonts.css";

import { TooltipProvider } from "@renderer/components/ui/tooltip";
import { initApiBase } from "@renderer/lib/api";
import NotFoundPage from "@renderer/pages/not-found";
import OnboardingPage from "@renderer/pages/onboarding";
import DictionaryPage from "@renderer/pages/settings/dictionary";
import FormatsPage from "@renderer/pages/settings/formats";
import GeneralSettingsPage from "@renderer/pages/settings/general";
import HistoryPage from "@renderer/pages/settings/history";
import ModelsPage from "@renderer/pages/settings/models";
import VocabularyPage from "@renderer/pages/settings/vocabulary";
import AppShell from "@renderer/pages/shell";
import TodayPage from "@renderer/pages/today";
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
                <Route path="/settings" element={<GeneralSettingsPage />} />
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
