import "../overlay.css";
import "../notification.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NotificationCard } from "../components/notification-card";
import { parseScenario } from "./fixtures";

function NotificationPreview() {
  const [visible, setVisible] = useState(
    parseScenario(new URLSearchParams(location.search).get("scenario")) !==
      "empty",
  );
  return visible ? (
    <section className="remix-notification-stack" aria-label="Notifications">
      <NotificationCard
        item={{
          id: "preview",
          title: "Your brief is ready",
          body: "Review the browser preview and continue your work.",
        }}
        onOpen={() => window.api.openRemixWorkspace("preview-thread")}
        onDismiss={() => setVisible(false)}
        badge={0}
        onExpand={() => {}}
      />
    </section>
  ) : null;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<NotificationPreview />);
