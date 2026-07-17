import type { CSSProperties } from "react";

export const pageStyle: CSSProperties = {
  fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif",
  background: "var(--background, #09090b)",
  color: "var(--foreground, #fafafa)",
  minHeight: "100vh",
  padding: "28px 32px",
  maxWidth: 760,
  margin: "0 auto",
};

export const h1Style: CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  margin: "0 0 4px",
};

export const subtitleStyle: CSSProperties = {
  fontSize: 13,
  opacity: 0.6,
  margin: "0 0 24px",
};

export const sectionStyle: CSSProperties = {
  border: "1px solid var(--border, #27272a)",
  borderRadius: 12,
  padding: 20,
  marginBottom: 20,
};

export const sectionHeadStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 14,
};

export const sectionTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  margin: 0,
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  opacity: 0.8,
  marginBottom: 6,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--border, #27272a)",
  background: "var(--input, #18181b)",
  color: "var(--foreground, #fafafa)",
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 80,
  resize: "vertical",
};

export const primaryBtnStyle: CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  border: "none",
  background: "var(--primary, #6B8F12)",
  color: "var(--primary-foreground, #fff)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

export const ghostBtnStyle: CSSProperties = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--border, #27272a)",
  background: "transparent",
  color: "var(--foreground, #fafafa)",
  fontSize: 12,
  cursor: "pointer",
};

export const dangerBtnStyle: CSSProperties = {
  ...ghostBtnStyle,
  color: "var(--destructive, #f87171)",
  borderColor: "var(--destructive, #f87171)",
};

export const cardStyle: CSSProperties = {
  border: "1px solid var(--border, #27272a)",
  borderRadius: 10,
  padding: 14,
  marginBottom: 10,
};

export const rowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

export const fieldStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export const savedPillStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--primary, #8AB62A)",
  opacity: 0.9,
};
