/**
 * How the pill's cancel button is shown. In hover mode, revealing the button
 * trades the waveform's oldest bars for the button without resizing the pill.
 */
export type PillCancelMode = "always" | "hover";

export function normalizePillCancelMode(value: unknown): PillCancelMode {
  return value === "always" ? "always" : "hover";
}
