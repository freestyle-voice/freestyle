import "./globals.css";
import "./fonts.css";

import { initApiBase } from "@renderer/lib/api";
import BarPage from "@renderer/pages/bar";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

initApiBase();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <BarPage />
    </ThemeProvider>
  </StrictMode>,
);
