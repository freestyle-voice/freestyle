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

/** Decode a base64 string to UTF-8 text (atob mangles multibyte chars). */
function decodeBase64Utf8(b64: string): string {
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

/** First non-comment, non-empty line of a text/uri-list body. */
function firstUri(text: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t && !t.startsWith("#")) return t;
  }
  return undefined;
}

/** Resolve the widget's HTML (inline text or base64 blob) or an external URL. */
function resolveContent(resource: UiResource): {
  srcDoc?: string;
  src?: string;
} {
  const mime = (resource.mimeType ?? "").toLowerCase();

  // externalUrl variant: mimeType is text/uri-list, URL is in `text`.
  if (mime.includes("uri-list")) {
    const url = resource.text ? firstUri(resource.text) : undefined;
    if (url?.startsWith("http")) return { src: url };
  }

  if (typeof resource.text === "string") return { srcDoc: resource.text };
  if (typeof resource.blob === "string") {
    return { srcDoc: decodeBase64Utf8(resource.blob) };
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
}: Props): React.JSX.Element | null {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(180);
  const { srcDoc, src } = resolveContent(resource);

  // Nothing to render — don't show an empty iframe.
  const hasContent = !!src || !!srcDoc?.trim();

  const handleMessage = useCallback(
    (e: MessageEvent) => {
      // Only accept messages from our own iframe's content window. A sandboxed
      // (no allow-same-origin) srcdoc frame reports origin "null"; an external
      // URL frame reports its real origin. The source check is the primary
      // guard — a cross-window sender can't forge event.source.
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) {
        return;
      }
      const data = e.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object") return;

      // Auto-size: mcp-ui posts `{ type: "ui-size-change", payload: { height } }`.
      if (data.type === "ui-size-change") {
        const payload = (data.payload ?? {}) as Record<string, unknown>;
        const h = Number(payload.height);
        if (Number.isFinite(h) && h > 0) {
          setHeight(Math.max(60, Math.min(h, 600)));
        }
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
    if (!hasContent) return;
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage, hasContent]);

  if (!hasContent) return null;

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
