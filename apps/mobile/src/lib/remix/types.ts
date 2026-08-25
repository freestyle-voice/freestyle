export type RemixMode = "remix" | "dictate";

export type RemixThreadOrigin = "user" | "scheduled";

export interface RemixThreadSummary {
  id: string;
  title: string;
  updatedAt: number;
  origin?: RemixThreadOrigin;
}

export interface RemixThreadPage {
  threads: RemixThreadSummary[];
  nextCursor: number | null;
}

export type RemixStreamEvent =
  | { type: "text"; text: string }
  | {
      type: "tool";
      toolCallId: string;
      name: string;
      input: unknown;
    }
  | {
      type: "tool-result-needed";
      toolCallId: string;
      name: "insert_at_cursor";
      input: unknown;
    }
  | { type: "complete" };

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
