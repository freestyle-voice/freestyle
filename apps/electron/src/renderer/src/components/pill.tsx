import "../globals.css";
import "../fonts.css";

import { ErrorBoundary } from "@renderer/components/error-boundary";
import { initApiBase } from "@renderer/lib/api";
import { installGlobalErrorHandlers } from "@renderer/lib/report-error";
import AppPage from "@renderer/pages/app";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

initApiBase();
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallback={null}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AppPage />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
