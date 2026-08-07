import {
  JEB_EMOTION_STATES,
  type JebEmotion,
  type JebScript,
  type JebStep,
} from "@shared/jeb";

/**
 * Tool call → choreography. Deterministic client code: the model never drives
 * animation state, so this costs zero prompt tokens and zero agent steps.
 *
 * Sync scripts defer the OS action until Jeb's impact frame (bounded by the
 * ceiling in main) — the paste lands on the sword swing. Everything else is
 * fire-and-forget decoration.
 */

let seq = 0;
function scriptId(): string {
  seq += 1;
  return `jeb-${Date.now()}-${seq}`;
}

interface Choreo {
  script: JebScript;
  /** Defer the OS action until impact (or the ceiling). */
  sync: boolean;
}

function make(sync: boolean, script: Omit<JebScript, "id">): Choreo {
  return { sync, script: { id: scriptId(), ...script } };
}

/**
 * Jeb performs at his corner for everything except paste — the one action
 * whose destination IS the user's cursor, so it keeps the run-leap-strike
 * trip. Everything ranged is a shuriken.
 */
export function choreoForTool(name: string): Choreo | null {
  switch (name) {
    case "get_context":
      // A reading stance at home while the copy runs.
      return make(false, {
        performance: [{ state: "defend", holdMs: 350 }],
        returnHome: false,
      });
    case "read_document":
      // Scales an invisible rope to skim the whole document.
      return make(false, {
        performance: [{ state: "climbing", loops: 2 }, { state: "jump-fall" }],
        returnHome: false,
      });
    case "select_all":
      // The giant vertical slash IS "select everything" — from his corner.
      return make(true, {
        performance: [{ state: "special-attack" }],
        returnHome: false,
      });
    case "select_text":
      // A precision shuriken pins the exact span from across the screen.
      return make(true, {
        performance: [{ state: "throw", fx: "shuriken", fxAngle: -15 }],
        returnHome: false,
      });
    case "paste":
      // The marquee moment: run, leap, and the paste fires on the hit frame.
      return make(true, {
        travel: "focused-window",
        travelKind: "jump",
        performance: [{ state: "attack-2" }, { state: "jump-fall" }],
      });
    case "copy":
    case "set_clipboard":
    case "set_clipboard_image":
      // Hurl the payload up to the clipboard shelf.
      return make(false, {
        performance: [
          { state: "throw", face: "right", fx: "shuriken", fxAngle: -55 },
        ],
        returnHome: false,
      });
    case "get_clipboard":
      return make(false, {
        performance: [{ state: "defend", holdMs: 200 }],
        returnHome: false,
      });
    case "undo":
      // "My mistake."
      return make(true, {
        performance: [{ state: "hurt" }],
        returnHome: false,
      });
    case "redo":
      return make(true, {
        performance: [{ state: "healing-no-effect", loops: 1 }],
        returnHome: false,
      });
    case "press_key":
      return make(true, {
        performance: [{ state: "attack-1" }],
        returnHome: false,
      });
    case "collapse_selection":
      // Sheathing flourish.
      return make(false, {
        performance: [{ state: "attack-3" }],
        returnHome: false,
      });
    case "web_search":
    case "image_search":
      // A shuriken hurled into the internet, then a sip while it's away.
      // Mostly vertical: the window hangs off-screen to his left, so an
      // up-left throw would vanish instantly.
      return make(false, {
        performance: [
          { state: "throw", fx: "shuriken", fxAngle: -80 },
          { state: "healing", loops: 2 },
        ],
        returnHome: false,
      });
    default:
      return null;
  }
}

export function choreoForFailure(reason: string): JebScript {
  const secure = reason === "secure-input";
  const steps: JebStep[] = secure
    ? [{ state: "defend", holdMs: 900 }]
    : [{ state: "hurt" }];
  return {
    id: scriptId(),
    performance: steps,
    returnHome: true,
    say: secure ? "I don't fight password fields." : undefined,
  };
}

export function emoteScript(emotion: JebEmotion): JebScript {
  return {
    id: scriptId(),
    performance: [{ state: JEB_EMOTION_STATES[emotion] }],
    returnHome: false,
  };
}
