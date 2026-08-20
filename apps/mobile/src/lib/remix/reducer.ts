import {
  EMPTY_REMIX_TURN,
  type RemixTurnEvent,
  type RemixTurnState,
} from "./types";

export function reduceRemixEvent(
  state: RemixTurnState = EMPTY_REMIX_TURN,
  event: RemixTurnEvent,
): RemixTurnState {
  switch (event.type) {
    case "question":
      return {
        ...state,
        phase: event.autoListen ? "listening" : "question",
        question: event.text,
      };
    case "final-tool-request":
      return {
        ...state,
        phase: "ready",
        question: null,
        finalText: event.text,
      };
    case "inserted":
      return { ...EMPTY_REMIX_TURN, insertionUsed: true };
  }
}

export function canInsertKeyboardFinal(state: RemixTurnState): boolean {
  return (
    state.phase === "ready" &&
    !state.insertionUsed &&
    state.finalText?.trim().length !== 0
  );
}
