/**
 * Desktop-only companion preference and display state. This deliberately has
 * no connection to server settings or dictation: the pet only observes the
 * work already happening in the renderer.
 */
export type PetState = "idle" | "working" | "approval-needed" | "attention";

export function parsePetEnabled(value: unknown): boolean {
  return value === true || value === "true";
}

export function petStateFor({
  working,
  approvalNeeded,
  attention = false,
}: {
  working: boolean;
  approvalNeeded: boolean;
  attention?: boolean;
}): PetState {
  if (attention) return "attention";
  if (approvalNeeded) return "approval-needed";
  return working ? "working" : "idle";
}
