import { useCallback, useEffect, useRef, useState } from "react";
import type { UiResource } from "../shared/types";

/**
 * An action posted by a widget iframe via `window.parent.postMessage`.
 * Follows the mcp-ui protocol: `{ type, payload }` where type is one of
 * tool | prompt | link | intent | notify.
 */
export interface WidgetAction {
  type: string;
  payload?: Record<string, unknown>;
}

interface Props {
  resource: UiResource;
  /** Called when the widget posts an action. Return value is ignored. */
  onAction?: (action: WidgetAction) => void;
}

/** Resolve the widget's HTML (inline text or base64 blob) or an external URL. */
function resolveContent(resource: UiResource): {
  srcDoc?: string;
  src?: string;
} {
  const mime = resource.mimeType.toLowerCase();
  // externalUrl variant: the resource text/uri points to an embeddable page.
  if (mime.includes("uri-list") || resource.uri.startsWith("http")) {
    // mcp-ui externalUrl encodes the URL in `text`.
    const url = resource.text?.trim() || resource.uri;
    if (url.startsWith("http")) return { src: url };
  }
  if (typeof resource.text === "string") return { srcDoc: resource.text };
  if (typeof resource.blob === "string") {
    try {
      return { srcDoc: atob(resource.blob) };
    } catch {
      return { srcDoc: "" };
    }
  }
  return { srcDoc: "" };
}

/**
 * Renders an MCP UI widget inside a sandboxed iframe. The iframe is sandboxed
 * with `allow-scripts` only (no `allow-same-origin`), so widget HTML cannot
 * touch the panel DOM or the Freestyle bridge. Actions flow out via
 * postMessage and are forwarded to `onAction`.
 */
export function WidgetRenderer({
  resource,
  onAction,
}: Props): React.JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(180);
  const { srcDoc, src } = resolveContent(resource);

  const handleMessage = useCallback(
    (e: MessageEvent) => {
      // Only accept messages from our own iframe's content window.
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) {
        return;
      }
      const data = e.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object") return;

      // Auto-size: widgets may post their content height.
      if (
        data.type === "ui-size-change" ||
        data.type === "mcp-ui:size" ||
        data.type === "size"
      ) {
        const payload = (data.payload ?? data) as Record<string, unknown>;
        const h = Number(payload.height);
        if (Number.isFinite(h) && h > 0) setHeight(Math.min(h, 600));
        return;
      }

      // mcp-ui actions: tool | prompt | link | intent | notify
      if (
        typeof data.type === "string" &&
        ["tool", "prompt", "link", "intent", "notify"].includes(data.type)
      ) {
        onAction?.({
          type: data.type,
          payload: (data.payload ?? {}) as Record<string, unknown>,
        });
      }
    },
    [onAction],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  return (
    <div className="widget-frame">
      <iframe
        ref={iframeRef}
        title="Interactive widget"
        sandbox="allow-scripts allow-forms"
        // srcDoc for inline HTML, src for external URLs.
        {...(src ? { src } : { srcDoc: srcDoc ?? "" })}
        style={{ height }}
      />
    </div>
  );
}
