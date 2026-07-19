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
    const isCustomScheme = scheme !== "http" && scheme !== "https";

    // Skip bare app-launch stubs (e.g. `gpay://upi/`, `phonepe://`) that carry
    // no transaction — those show up in a payment *picker* and aren't a real
    // action. Only surface a custom-scheme link when it has a meaningful
    // path/query (an actual payment intent).
    if (isCustomScheme) {
      const rest = url.slice(url.indexOf("://") + 3);
      const meaningful = rest.replace(/^upi\/?$/i, "").replace(/\/$/, "");
      if (!meaningful) continue;
    }

    const isPayment = isCustomScheme || /pay|deeplink|upi|checkout/i.test(url);
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
  // A hosted widget (external `src`) or an MCP Apps widget only proves it has
  // renderable content by posting a size/handshake message. If it never does,
  // it's effectively blank — we hide the empty frame and fall back to the
  // action button below. Inline `srcDoc` widgets are trusted (we can't measure
  // them across the sandbox, and our own widgets render immediately).
  const needsProof = !!src || mcpApp;
  const [proven, setProven] = useState(false);

  // Widgets that must prove themselves start compact to avoid flashing a big
  // empty box during the grace period; trusted inline widgets get a real
  // default. Once a size message arrives the frame grows to fit.
  const [height, setHeight] = useState(needsProof ? 40 : 180);

  // Nothing to render — don't show an empty iframe.
  const hasContent = !!src || !!srcDoc?.trim();

  // For an external `src` widget, target its own origin so tool input/result
  // data can't leak to an attacker origin if the frame navigates away. A
  // sandboxed `srcDoc` frame has the opaque origin "null", which only matches
  // targetOrigin "*", so keep "*" in that case.
  const targetOrigin = (() => {
    if (!src) return "*";
    try {
      return new URL(src).origin;
    } catch {
      return "*";
    }
  })();

  const post = useCallback(
    (message: unknown) => {
      iframeRef.current?.contentWindow?.postMessage(message, targetOrigin);
    },
    [targetOrigin],
  );

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
            setProven(true);
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

      // MCP Apps (JSON-RPC over postMessage): guest → host requests. A
      // well-formed JSON-RPC message means the widget's runtime booted and
      // completed its handshake — that's genuine proof of life (unlike an
      // arbitrary stray postMessage, which we ignore for the proof check).
      if (data.jsonrpc === "2.0" && typeof data.method === "string") {
        setProven(true);
        handleMcpAppRequest(data);
        return;
      }

      // Auto-size: mcp-ui posts `{ type: "ui-size-change", payload: { height } }`.
      // A valid size is proof the widget rendered real content.
      if (data.type === "ui-size-change") {
        const payload = (data.payload ?? {}) as Record<string, unknown>;
        const h = Number(payload.height);
        if (Number.isFinite(h) && h > 0) {
          setHeight(Math.max(60, Math.min(h, 600)));
          setProven(true);
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

  // A widget that must prove itself (hosted `src` / MCP Apps) gets a grace
  // period to post a size/handshake. If it stays silent it rendered nothing —
  // stop reserving space for the empty frame and let the fallback take over.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!hasContent || !needsProof || proven) return;
    const t = setTimeout(() => setGaveUp(true), 2500);
    return () => clearTimeout(t);
  }, [hasContent, needsProof, proven]);

  // When the resource changes (a new widget replaces this one), reset the
  // per-widget state — otherwise a stale height/proven/gaveUp from the previous
  // widget leaks into the new one (useState initializers only run on mount).
  useEffect(() => {
    setProven(false);
    setGaveUp(false);
    setHeight(needsProof ? 40 : 180);
  }, [needsProof]);

  // Fallback action links pulled from the tool output (e.g. a payment
  // deep-link). These guarantee the user has a tappable affordance even when a
  // hosted widget renders blank or an inline widget lacks a visible control.
  const fallbackLinks = extractFallbackLinks(toolOutput);

  const openLink = useCallback(
    (url: string) => onAction?.({ type: "link", payload: { url } }),
    [onAction],
  );

  // Show the frame when it has content AND (it doesn't need to prove itself, or
  // it has proven / not yet given up). A proven-blank frame is hidden.
  const showFrame = hasContent && (!needsProof || proven || !gaveUp);

  // Nothing to show at all.
  if (!showFrame && fallbackLinks.length === 0) return null;

  return (
    <>
      {showFrame && (
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
