/** The pill reserves extra room only for dictation recovery. */
export type PillExpansion = "card";
export type PillPresentationKind = "collapsed" | PillExpansion;
export interface PillPresentation {
  kind: PillPresentationKind;
  expansion: PillExpansion | null;
}
export interface PillPresentationInput {
  dictationError: boolean;
}
export function resolvePillPresentation(
  input: PillPresentationInput,
): PillPresentation {
  return input.dictationError
    ? { kind: "card", expansion: "card" }
    : { kind: "collapsed", expansion: null };
}
/** Legacy and unrecognized requests fall back to the recovery card. */
export function normalizePillExpansion(_value: unknown): PillExpansion {
  return "card";
}
