import AppPage from "@renderer/pages/app";
import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router";

const OnboardingPage = lazy(() => import("@renderer/pages/onboarding"));
const NotFoundPage = lazy(() => import("@renderer/pages/not-found"));
const AppShell = lazy(() => import("@renderer/pages/shell"));
const TodayPage = lazy(() => import("@renderer/pages/today"));
const GeneralSettingsPage = lazy(
  () => import("@renderer/pages/settings/general"),
);
const ModelsPage = lazy(() => import("@renderer/pages/settings/models"));
const DictionaryPage = lazy(
  () => import("@renderer/pages/settings/dictionary"),
);
const FormatsPage = lazy(() => import("@renderer/pages/settings/formats"));
const HistoryPage = lazy(() => import("@renderer/pages/settings/history"));
const FeedbackPage = lazy(() => import("@renderer/pages/settings/feedback"));
const PermissionsPage = lazy(
  () => import("@renderer/pages/settings/permissions"),
);

function PagePad(): React.JSX.Element {
  return (
    <div className="px-12 py-9">
      <Outlet />
    </div>
  );
}

export default function App(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/app" element={<AppPage />} />
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
            <Route path="/settings/dictionary" element={<DictionaryPage />} />
            <Route path="/settings/formats" element={<FormatsPage />} />
            <Route path="/settings/history" element={<HistoryPage />} />
            <Route path="/settings/feedback" element={<FeedbackPage />} />
            <Route path="/settings/permissions" element={<PermissionsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
