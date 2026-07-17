import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChatPanel } from "./chat-panel";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChatPanel />
  </StrictMode>,
);
