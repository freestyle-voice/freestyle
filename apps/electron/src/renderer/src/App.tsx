import AppPage from "@renderer/pages/app";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";

const OnboardingPage = lazy(() => import("@renderer/pages/onboarding"));
const NotFoundPage = lazy(() => import("@renderer/pages/not-found"));
const SettingsLayout = lazy(() => import("@renderer/pages/settings/layout"));
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

export default function App(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/app" element={<AppPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<GeneralSettingsPage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="dictionary" element={<DictionaryPage />} />
          <Route path="formats" element={<FormatsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="feedback" element={<FeedbackPage />} />
          <Route path="permissions" element={<PermissionsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
