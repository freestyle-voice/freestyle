import { init as electronRendererInit } from "@sentry/electron/renderer";
import { init as reactInit } from "@sentry/react";

electronRendererInit({}, reactInit);

import "./globals.css";

import { TooltipProvider } from "@renderer/components/ui/tooltip";
import { initApiBase } from "@renderer/lib/api";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";

// Resolve the server port before rendering the app
initApiBase().then(() => {
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
            <App />
          </TooltipProvider>
        </ThemeProvider>
      </BrowserRouter>
    </StrictMode>,
  );
});
