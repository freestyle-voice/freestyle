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
  /** The arguments the tool was called with (for MCP Apps tool-input). */
  toolInput?: Record<string, unknown>;
  /** The tool's text result (for MCP Apps tool-result). */
  toolOutput?: string;
  /** Called when the widget posts an action. Return value is ignored. */
  onAction?: (action: WidgetAction) => void;
}

/** True for an MCP Apps widget (needs the JSON-RPC tool-input/result push). */
function isMcpApp(resource: UiResource): boolean {
  return (resource.mimeType ?? "").toLowerCase().includes("mcp-app");
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

/** A tappable link surfaced from the tool output as a fallback affordance. */
interface FallbackLink {
  url: string;
  label: string;
}

/** URL schemes we treat as an openable action link in tool output. */
const ACTION_URL_RE =
  /\b((?:https?|upi|gpay|phonepe|paytmmp|bhim|credpay|super):\/\/[^\s)"'<>]+)/gi;

/**
 * Pull openable links out of a tool's text output so we can always show the
 * user a tappable button — even when a hosted widget renders blank. Payment
 * deep-links (`upi://`, `gpay://`, …) and any `https://…deeplink`/pay URL are
 * prioritized and get a friendly label.
 */
function extractFallbackLinks(text: string | undefined): FallbackLink[] {
  if (!text) return [];
  const seen = new Set<string>();
  const links: FallbackLink[] = [];
  for (const m of text.matchAll(ACTION_URL_RE)) {
    const url = m[1].replace(/[.,]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    const scheme = url.slice(0, url.indexOf(":")).toLowerCase();
    const isPayment =
      scheme !== "http" && scheme !== "https"
        ? true
        : /pay|deeplink|upi|checkout/i.test(url);
    links.push({
      url,
      label: isPayment ? "Open payment app" : "Open link",
    });
  }
  // Prefer a single, clear payment action when present.
  const payment = links.find((l) => l.label === "Open payment app");
  return payment ? [payment] : links.slice(0, 1);
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

  // Inline content takes precedence when present.
  if (typeof resource.text === "string" && resource.text.trim()) {
    return { srcDoc: resource.text };
  }
  if (typeof resource.blob === "string" && resource.blob.trim()) {
    return { srcDoc: decodeBase64Utf8(resource.blob) };
  }

  // Hosted widget: no inline body, but the resource URI is an http(s) page the
  // iframe can load directly.
  if (resource.uri?.startsWith("http")) return { src: resource.uri };

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
  toolInput,
  toolOutput,
  onAction,
}: Props): React.JSX.Element | null {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { srcDoc, src } = resolveContent(resource);
  const mcpApp = isMcpApp(resource);
  // MCP Apps widgets render nothing until the host pushes data and then report
  // their size, so start compact to avoid a big empty gap; legacy self-contained
  // widgets get a reasonable default.
  const [height, setHeight] = useState(mcpApp ? 40 : 180);

  // Nothing to render — don't show an empty iframe.
  const hasContent = !!src || !!srcDoc?.trim();

  const post = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  /**
   * MCP Apps widgets render nothing until the host pushes the tool input +
   * result over JSON-RPC. Send those notifications once the iframe loads.
   */
  const pushMcpAppData = useCallback(() => {
    if (!mcpApp) return;
    if (toolInput) {
      post({
        jsonrpc: "2.0",
        method: "ui/notifications/tool-input",
        params: { input: toolInput },
      });
    }
    post({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        result: { content: [{ type: "text", text: toolOutput ?? "" }] },
      },
    });
  }, [mcpApp, toolInput, toolOutput, post]);

  /** Translate an MCP Apps guest→host JSON-RPC request into a widget action. */
  const handleMcpAppRequest = useCallback(
    (msg: Record<string, unknown>) => {
      const params = (msg.params ?? {}) as Record<string, unknown>;
      switch (msg.method) {
        case "ui/notifications/size-changed": {
          const h = Number(params.height);
          if (Number.isFinite(h) && h > 0) {
            setHeight(Math.max(60, Math.min(h, 600)));
          }
          break;
        }
        case "tools/call":
          onAction?.({
            type: "tool",
            payload: {
              toolName: params.name ?? params.toolName,
              params: params.arguments ?? params.params ?? {},
            },
          });
          break;
        case "ui/message":
          onAction?.({ type: "prompt", payload: { prompt: params.message } });
          break;
        case "ui/open-link":
          onAction?.({ type: "link", payload: { url: params.url } });
          break;
        default:
          break;
      }
      // Acknowledge requests that carry an id (fire-and-forget for the agent).
      if (msg.id !== undefined) {
        post({ jsonrpc: "2.0", id: msg.id, result: {} });
      }
    },
    [onAction, post],
  );

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

      // MCP Apps (JSON-RPC over postMessage): guest → host requests.
      if (data.jsonrpc === "2.0" && typeof data.method === "string") {
        handleMcpAppRequest(data);
        return;
      }

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
    [onAction, handleMcpAppRequest],
  );

  useEffect(() => {
    if (!hasContent) return;
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage, hasContent]);

  // Fallback action links pulled from the tool output (e.g. a payment
  // deep-link). These guarantee the user has a tappable affordance even when a
  // hosted widget renders blank or an inline widget lacks a visible control.
  const fallbackLinks = extractFallbackLinks(toolOutput);

  const openLink = useCallback(
    (url: string) => onAction?.({ type: "link", payload: { url } }),
    [onAction],
  );

  // Nothing to show at all.
  if (!hasContent && fallbackLinks.length === 0) return null;

  return (
    <>
      {hasContent && (
        <div className="widget-frame">
          <iframe
            ref={iframeRef}
            title="Interactive widget"
            sandbox="allow-scripts allow-forms"
            onLoad={pushMcpAppData}
            // srcDoc for inline HTML, src for external URLs.
            {...(src ? { src } : { srcDoc: srcDoc ?? "" })}
            style={{ height }}
          />
        </div>
      )}
      {fallbackLinks.length > 0 && (
        <div className="widget-fallback">
          {fallbackLinks.map((link) => (
            <button
              key={link.url}
              type="button"
              className="widget-fallback-btn"
              onClick={() => openLink(link.url)}
            >
              {link.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
