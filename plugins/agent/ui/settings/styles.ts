import type { CSSProperties } from "react";

/**
 * The settings page inherits the host app's warm, earthy palette via the
 * forwarded theme tokens. Layout favors calm, generous spacing and clear
 * section grouping over a dense form.
 */

export const pageStyle: CSSProperties = {
  fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif",
  background: "var(--background, #16140F)",
  color: "var(--foreground, #ECE7D6)",
  minHeight: "100vh",
  padding: "40px 28px 96px",
};

export const containerStyle: CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
};

export const heroStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  marginBottom: 28,
};

export const heroMarkStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 13,
  background: "var(--primary, #8AB62A)",
  color: "var(--primary-foreground, #16140F)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  flexShrink: 0,
  boxShadow:
    "0 6px 16px -6px color-mix(in srgb, var(--primary, #8AB62A) 60%, transparent)",
};

export const h1Style: CSSProperties = {
  fontSize: 21,
  fontWeight: 700,
  letterSpacing: "-0.02em",
  margin: 0,
};

export const subtitleStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--muted-foreground, #9E977F)",
  margin: "2px 0 0",
};

export const sectionStyle: CSSProperties = {
  background: "var(--card, #1E1C16)",
  border: "1px solid var(--border, #3A362D)",
  borderRadius: 16,
  padding: 22,
  marginBottom: 18,
};

export const sectionHeadStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 6,
};

export const sectionTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
};

export const sectionIconStyle: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 8,
  background:
    "color-mix(in srgb, var(--accent, #2E3F05) 55%, var(--card, #1E1C16))",
  color: "var(--accent-foreground, #E8EFC9)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 14,
  flexShrink: 0,
};

export const sectionTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  margin: 0,
};

export const sectionDescStyle: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "var(--muted-foreground, #9E977F)",
  margin: "0 0 16px",
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--foreground, #ECE7D6)",
  marginBottom: 6,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border, #3A362D)",
  background: "var(--input, #3A362D)",
  color: "var(--foreground, #ECE7D6)",
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color 120ms ease, box-shadow 120ms ease",
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 84,
  resize: "vertical",
  lineHeight: 1.5,
};

export const monoTextareaStyle: CSSProperties = {
  ...textareaStyle,
  minHeight: 62,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
};

export const hintTextStyle: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.5,
  color: "var(--muted-foreground, #9E977F)",
  margin: "6px 0 0",
};

export const primaryBtnStyle: CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "none",
  background: "var(--primary, #8AB62A)",
  color: "var(--primary-foreground, #16140F)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  transition: "filter 120ms ease",
};

export const ghostBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "7px 12px",
  borderRadius: 9,
  border: "1px solid var(--border, #3A362D)",
  background: "var(--secondary, #2A2720)",
  color: "var(--secondary-foreground, #ECE7D6)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 120ms ease",
};

export const iconGhostBtnStyle: CSSProperties = {
  width: 28,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  border: "1px solid var(--border, #3A362D)",
  background: "transparent",
  color: "var(--muted-foreground, #9E977F)",
  fontSize: 13,
  cursor: "pointer",
};

export const cardStyle: CSSProperties = {
  border: "1px solid var(--border, #3A362D)",
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
  background:
    "color-mix(in srgb, var(--secondary, #2A2720) 45%, var(--card, #1E1C16))",
};

export const cardHeadStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  marginBottom: 14,
};

export const fieldStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

export const emptyRowStyle: CSSProperties = {
  fontSize: 12.5,
  color: "var(--muted-foreground, #9E977F)",
  padding: "10px 2px",
  fontStyle: "italic",
};

export const toggleWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "var(--muted-foreground, #9E977F)",
  cursor: "pointer",
  userSelect: "none",
};

export const selectStyle: CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  appearance: "none",
};

export const saveBarStyle: CSSProperties = {
  position: "sticky",
  bottom: 0,
  display: "flex",
  gap: 12,
  alignItems: "center",
  justifyContent: "flex-end",
  padding: "14px 0 0",
};

export const savedPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 12,
  fontWeight: 500,
  color: "var(--primary, #8AB62A)",
};
