import type { CSSProperties } from "react";

export const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif",
  background: "var(--background, #09090b)",
  color: "var(--foreground, #fafafa)",
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid var(--border, #27272a)",
};

export const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 14px",
  borderBottom: "1px solid var(--border, #27272a)",
  flexShrink: 0,
};

export const titleStyle: CSSProperties = { fontWeight: 600, fontSize: 13 };

export const statusRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

export const statusDotStyle = (color: string): CSSProperties => ({
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: color,
  flexShrink: 0,
});

export const clearBtnStyle: CSSProperties = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 6,
  border: "1px solid var(--border, #27272a)",
  background: "transparent",
  color: "var(--muted-foreground, #a1a1aa)",
  cursor: "pointer",
};

export const closeBtnStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1,
  padding: "4px 7px",
  borderRadius: 6,
  border: "1px solid var(--border, #27272a)",
  background: "transparent",
  color: "var(--muted-foreground, #a1a1aa)",
  cursor: "pointer",
};

export const messagesStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

export const emptyStyle: CSSProperties = {
  textAlign: "center",
  opacity: 0.4,
  fontSize: 12,
  marginTop: 48,
  padding: "0 24px",
  lineHeight: 1.5,
};

export const bubbleStyle = (role: "user" | "assistant"): CSSProperties => ({
  padding: "8px 12px",
  borderRadius: 12,
  fontSize: 13,
  lineHeight: 1.45,
  maxWidth: "88%",
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
  alignSelf: role === "user" ? "flex-end" : "flex-start",
  background:
    role === "user" ? "var(--primary, #6B8F12)" : "var(--muted, #27272a)",
  color:
    role === "user"
      ? "var(--primary-foreground, #fff)"
      : "var(--foreground, #fafafa)",
});

export const hintStyle: CSSProperties = {
  padding: "8px 14px",
  borderTop: "1px solid var(--border, #27272a)",
  fontSize: 11,
  opacity: 0.5,
  textAlign: "center",
  flexShrink: 0,
};
