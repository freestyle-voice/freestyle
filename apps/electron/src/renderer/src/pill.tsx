import { init as electronRendererInit } from "@sentry/electron/renderer";
import { init as reactInit } from "@sentry/react";

electronRendererInit({}, reactInit);

import "./globals.css";

import { initApiBase } from "@renderer/lib/api";
import AppPage from "@renderer/pages/app";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

initApiBase().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AppPage />
      </ThemeProvider>
    </StrictMode>,
  );
});
