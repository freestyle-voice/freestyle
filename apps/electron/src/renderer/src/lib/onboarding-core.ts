export const ONBOARDING_KEY = "onboarding";
// Retained solely to read saved progress from earlier releases.
const BEATS = ["name", "trade", "inbox", "compass", "goal", "receipt"] as const;
type BeatId = (typeof BEATS)[number];

export interface OnboardingSaved {
  v: 2;
  done: boolean;
  beat?: BeatId;
  name?: string;
  trade?: string;
  task?: string;
  /** Toolkit slugs connected during the flow. */
  connected?: string[];
  /** Automation template ids created during the flow. */
  automations?: string[];
  /** A settings-triggered rerun — never seed a second thread from it. */
  replayed?: boolean;
}

export function parseSaved(value: string | undefined): OnboardingSaved | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as {
      v?: number;
      done?: boolean;
      task?: string;
      replayed?: boolean;
    };
    if (!parsed) return null;
    if (parsed.v === 2) {
      const saved = parsed as OnboardingSaved;
      // A saved beat from a different flow version restarts cleanly.
      if (saved.beat && !BEATS.includes(saved.beat))
        return { ...saved, beat: undefined };
      return saved;
    }
    // v1 completions stay completed; a v1 mid-flow save restarts the new flow.
    if (parsed.v === 1 && parsed.done === true) {
      return {
        v: 2,
        done: true,
        ...(parsed.task ? { task: parsed.task } : {}),
        ...(parsed.replayed ? { replayed: true } : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
}
