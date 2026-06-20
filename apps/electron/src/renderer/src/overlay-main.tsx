import OverlayPage from "@renderer/pages/overlay";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Keep the surface fully transparent regardless of any global theme styles —
// this window only ever draws the ghost cursor + caption.
document.documentElement.style.background = "transparent";
document.body.style.background = "transparent";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlayPage />
  </StrictMode>,
);
