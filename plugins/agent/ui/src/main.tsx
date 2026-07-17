import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AgentPanel } from "./agent-panel";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AgentPanel />
  </StrictMode>,
);
