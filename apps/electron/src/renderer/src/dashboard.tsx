import "./globals.css";
import "./fonts.css";

import { TooltipProvider } from "@renderer/components/ui/tooltip";
import { getApiBase, initApiBase } from "@renderer/lib/api";
import NotFoundPage from "@renderer/pages/not-found";
import OnboardingPage from "@renderer/pages/onboarding";
import DictionaryPage from "@renderer/pages/settings/dictionary";
import FormatsPage from "@renderer/pages/settings/formats";
import GeneralSettingsPage from "@renderer/pages/settings/general";
import HistoryPage from "@renderer/pages/settings/history";
import ModelsPage from "@renderer/pages/settings/models";
import ShortcutsPage from "@renderer/pages/settings/shortcuts";
import VocabularyPage from "@renderer/pages/settings/vocabulary";
import AppShell from "@renderer/pages/shell";
import TodayPage from "@renderer/pages/today";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
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

initApiBase().then(async () => {
  if (import.meta.env.PROD) {
    try {
      const res = await fetch(`${getApiBase()}/api/device-id`);
      const { deviceId } = (await res.json()) as { deviceId: string };
      posthog.init("phc_mDhFafyLK3Safsrrehi7rnH2X9jVMMGNAwKWuJsEN54w", {
        api_host: "https://us.i.posthog.com",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        persistence: "memory",
      });
      posthog.identify(deviceId);
    } catch {}
  }
});

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
                <Route path="/settings/shortcuts" element={<ShortcutsPage />} />
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
