import type { CSSProperties } from "react";

/**
 * The pill chat panel adopts the host app's warm, earthy palette through the
 * forwarded theme tokens (--background, --primary, …). Fallbacks mirror the
 * app's dark theme so the panel still reads correctly if tokens are late.
 */

export const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif",
  background: "var(--card, #1E1C16)",
  color: "var(--foreground, #ECE7D6)",
  borderRadius: 16,
  overflow: "hidden",
  border: "1px solid var(--border, #3A362D)",
  boxShadow: "0 12px 32px -8px rgba(0,0,0,0.45)",
};

export const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 14px",
  borderBottom: "1px solid var(--border, #3A362D)",
  flexShrink: 0,
  // A whisper of the accent so the header feels intentional, not a bare bar.
  background:
    "linear-gradient(to bottom, color-mix(in srgb, var(--accent, #2E3F05) 22%, transparent), transparent)",
};

export const brandRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
};

export const markStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 7,
  background: "var(--primary, #8AB62A)",
  color: "var(--primary-foreground, #16140F)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0,
};

export const titleStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: 13.5,
  letterSpacing: "-0.01em",
};

export const statusRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
};

export const statusPillStyle = (color: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 10.5,
  fontWeight: 500,
  letterSpacing: "0.02em",
  padding: "3px 8px 3px 6px",
  borderRadius: 999,
  color,
  background: `color-mix(in srgb, ${color} 14%, transparent)`,
});

export const statusDotStyle = (
  color: string,
  pulse: boolean,
): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: color,
  flexShrink: 0,
  animation: pulse ? "agent-pulse 1.4s ease-in-out infinite" : undefined,
});

export const iconBtnStyle: CSSProperties = {
  width: 24,
  height: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  lineHeight: 1,
  borderRadius: 7,
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--muted-foreground, #9E977F)",
  cursor: "pointer",
  transition: "background 120ms ease, color 120ms ease",
};

export const messagesStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "14px 14px 6px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export const emptyWrapStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: "0 28px",
  textAlign: "center",
};

export const emptyMarkStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 13,
  background:
    "color-mix(in srgb, var(--primary, #8AB62A) 16%, var(--card, #1E1C16))",
  color: "var(--primary, #8AB62A)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 19,
};

export const emptyTitleStyle: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
};

export const emptyHintStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--muted-foreground, #9E977F)",
};

export const kbdStyle: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11,
  padding: "1px 6px",
  borderRadius: 5,
  border: "1px solid var(--border, #3A362D)",
  background: "var(--muted, #2A2720)",
  color: "var(--foreground, #ECE7D6)",
};

export const turnStyle = (role: "user" | "assistant"): CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  alignItems: role === "user" ? "flex-end" : "flex-start",
});

export const roleLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--muted-foreground, #9E977F)",
  padding: "0 4px",
};

export const bubbleStyle = (role: "user" | "assistant"): CSSProperties => ({
  padding: "9px 13px",
  fontSize: 13,
  lineHeight: 1.5,
  maxWidth: "90%",
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
  background:
    role === "user" ? "var(--primary, #8AB62A)" : "var(--secondary, #2A2720)",
  color:
    role === "user"
      ? "var(--primary-foreground, #16140F)"
      : "var(--secondary-foreground, #ECE7D6)",
  // Speech-bubble tail: square the corner nearest the speaker.
  borderRadius: 14,
  borderBottomRightRadius: role === "user" ? 4 : 14,
  borderBottomLeftRadius: role === "assistant" ? 4 : 14,
});

export const typingStyle: CSSProperties = {
  display: "inline-flex",
  gap: 4,
  padding: "12px 14px",
  background: "var(--secondary, #2A2720)",
  borderRadius: 14,
  borderBottomLeftRadius: 4,
};

export const typingDotStyle = (i: number): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--muted-foreground, #9E977F)",
  animation: "agent-typing 1.2s ease-in-out infinite",
  animationDelay: `${i * 0.18}s`,
});

export const composerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 14px",
  borderTop: "1px solid var(--border, #3A362D)",
  fontSize: 11.5,
  color: "var(--muted-foreground, #9E977F)",
  flexShrink: 0,
};

/** Keyframes injected once into the panel document. */
export const KEYFRAMES = `
@keyframes agent-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.82); }
}
@keyframes agent-typing {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}
@keyframes agent-rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
