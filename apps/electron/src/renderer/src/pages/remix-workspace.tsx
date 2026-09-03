import {
  PanelNotificationAuthBridge,
  RemixWorkspace,
} from "@renderer/components/panel";
import "@renderer/remix-workspace.css";

/** The full desktop home for the durable Remix agent. */
export default function RemixWorkspacePage(): React.JSX.Element {
  return (
    <PanelNotificationAuthBridge>
      <RemixWorkspace />
    </PanelNotificationAuthBridge>
  );
}
