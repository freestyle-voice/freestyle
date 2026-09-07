import type { DurableThreadRuntime } from "./threads";

export type RemixRunState = {
  state: "approval" | "desktop" | "working" | "queued" | "attention" | "idle";
  title: string;
  detail: string;
  turnId?: string;
};

/**
 * The context rail needs one calm, actionable summary rather than the raw
 * durable runtime envelope. Pending actions take precedence because they are
 * the only states in which the user can unblock a turn.
 */
export function describeRemixRun(
  runtime: Pick<DurableThreadRuntime, "activeTurn" | "pendingAction"> | null,
  hasLocalApproval = false,
): RemixRunState {
  const turnId = runtime?.pendingAction?.turnId ?? runtime?.activeTurn?.id;
  const pendingAction = runtime?.pendingAction;

  if (hasLocalApproval) {
    return {
      state: "approval",
      title: "Approval needed",
      detail: "Review the local action before Remix can continue.",
      ...(turnId ? { turnId } : {}),
    };
  }

  if (pendingAction?.status === "pending") {
    if (pendingAction.kind === "connector") {
      return {
        state: "approval",
        title: "Approval needed",
        detail: "Review the connected-app action before Remix can continue.",
        ...(turnId ? { turnId } : {}),
      };
    }
    return {
      state: "desktop",
      title: "Action ready on this desktop",
      detail: "Open it here to let Remix continue.",
      ...(turnId ? { turnId } : {}),
    };
  }

  const activeTurn = runtime?.activeTurn;
  if (activeTurn) {
    switch (activeTurn.status) {
      case "queued":
        return {
          state: "queued",
          title: "Remix is queued",
          detail: "It will start as soon as the current work finishes.",
          turnId: activeTurn.id,
        };
      case "running":
        return {
          state: "working",
          title: "Remix is working",
          detail: "Follow its progress or send a follow-up.",
          turnId: activeTurn.id,
        };
      case "waiting_approval":
        if (pendingAction?.status === "claimed") {
          return {
            state: "working",
            title: "Remix is completing an approved action",
            detail: "Follow its progress while Remix finishes this step.",
            turnId: activeTurn.id,
          };
        }
        return {
          state: "approval",
          title: "Approval needs attention",
          detail: "Review the action so Remix can continue.",
          turnId: activeTurn.id,
        };
      case "waiting_desktop":
        return {
          state: "desktop",
          title: "Waiting for this desktop",
          detail: "Open Freestyle here to let Remix continue.",
          turnId: activeTurn.id,
        };
      case "needs_desktop":
        return {
          state: "desktop",
          title: "A desktop is needed",
          detail: `${activeTurn.error ?? "This step needs an available Freestyle desktop."} Reconnect an available Freestyle desktop to continue.`,
          turnId: activeTurn.id,
        };
      case "failed":
        return {
          state: "attention",
          title: "Run needs attention",
          detail: activeTurn.error ?? "Remix couldn't finish this run.",
          turnId: activeTurn.id,
        };
      case "completed":
      case "canceled":
        return {
          state: "idle",
          title: "No active run",
          detail:
            "The latest run is finished. Start a conversation to continue.",
          turnId: activeTurn.id,
        };
      default:
        return {
          state: "working",
          title: "Remix is working",
          detail: "Follow its progress or send a follow-up.",
          turnId: activeTurn.id,
        };
    }
  }

  return {
    state: "idle",
    title: "No active run",
    detail: "Start a conversation to give Remix something to do.",
  };
}
