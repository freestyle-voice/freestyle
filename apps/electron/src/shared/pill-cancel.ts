/**
 * How the pill's cancel button is shown. The button's space is reserved in
 * both modes — the waveform is drawn shorter either way — so switching
 * between them only changes whether the button is visible, never the layout.
 */
export type PillCancelMode = "always" | "hover";

export function normalizePillCancelMode(
  value: string | null | undefined,
): PillCancelMode {
  return value === "always" ? "always" : "hover";
}
