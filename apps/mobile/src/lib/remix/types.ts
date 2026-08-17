export type RemixMode = "remix" | "dictate";

export type RemixTurnPhase = "idle" | "listening" | "question" | "ready";

export interface RemixTurnState {
  phase: RemixTurnPhase;
  question: string | null;
  finalText: string | null;
  insertionUsed: boolean;
}

export type RemixTurnEvent =
  | { type: "question"; text: string; autoListen: boolean }
  | { type: "final-tool-request"; text: string }
  | { type: "inserted" };

export const EMPTY_REMIX_TURN: RemixTurnState = {
  phase: "idle",
  question: null,
  finalText: null,
  insertionUsed: false,
};
