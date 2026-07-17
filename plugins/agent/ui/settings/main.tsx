import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SettingsPage } from "./settings-page";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsPage />
  </StrictMode>,
);
