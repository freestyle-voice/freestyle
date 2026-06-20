/**
 * Cross-platform desktop-control contract.
 *
 * The agent-facing MCP tools, coordinate clamping, and the screenshot-relative
 * coordinate convention are identical on every OS — only the backend behind
 * this interface swaps (macOS today; Windows/Linux next). Keeping the seam here
 * is what makes computer use consistent across platforms: a new OS is "write
 * one more `DesktopActuator`", not "fork the whole feature".
 */
import type { ComputerUsePrereqs } from "@freestyle/validations";

export type MouseButton = "left" | "right";

/**
 * Which actions a backend can actually perform in the *current* environment.
 * The MCP tool list is generated from this, so the model never sees a tool the
 * platform/session can't honor (e.g. input on a locked-down Wayland session).
 */
export interface DesktopCapabilities {
  screenshot: boolean;
  mouseMove: boolean;
  click: boolean;
  doubleClick: boolean;
  typeText: boolean;
  pressKey: boolean;
}

export interface Screenshot {
  /** base64-encoded PNG. */
  data: string;
  /** Logical pixel size — the coordinate space every action uses. */
  width: number;
  height: number;
}

export interface HelperResult {
  ok: boolean;
  reason?: string;
}

export interface SelfTestResult {
  ok: boolean;
  /** Human-readable summary, logged at session start. */
  details: string;
}

/**
 * Platform-agnostic desktop actuator. Coordinates are LOGICAL pixels in the
 * most recent screenshot's space (top-left origin); each backend maps that to
 * its own device-pixel / DPI / multi-monitor geometry and is responsible for
 * clamping to the visible bounds.
 */
export interface DesktopActuator {
  /** The `process.platform` value this backend serves. */
  readonly platform: NodeJS.Platform;

  /**
   * How actions are carried out:
   *  - `direct` — really moves the cursor / presses keys (full computer use).
   *  - `guided` — never actuates; surfaces a ghost-cursor overlay pointing the
   *    user to each step (the user performs it). The MCP facade phrases tool
   *    results and instructions differently based on this.
   */
  readonly actuation: "direct" | "guided";

  /** What this backend can do right now. Drives MCP tool registration. */
  capabilities(): DesktopCapabilities;

  /** Live permission/health snapshot (cheap; safe to probe per action). */
  prereqs(): Promise<ComputerUsePrereqs>;

  /** Best-effort trigger of any first-run OS permission prompt. */
  requestPermissions(): Promise<ComputerUsePrereqs>;

  /** Locate or install the input helper this backend needs (no-op if none). */
  ensureHelper(): Promise<HelperResult>;

  /**
   * One-shot functional check, run at session start, to surface *silent*
   * breakage — a helper that's present but no longer actuates (exactly the
   * cliclick-on-macOS-26 failure mode). Non-blocking; logged.
   */
  selfTest(): Promise<SelfTestResult>;

  screenshot(): Promise<Screenshot>;
  // `note` is an optional human caption for the step. `direct` backends ignore
  // it; the `guided` backend shows it as the overlay caption.
  moveCursor(x: number, y: number, note?: string): Promise<void>;
  click(
    x: number,
    y: number,
    button: MouseButton,
    note?: string,
  ): Promise<void>;
  doubleClick(x: number, y: number, note?: string): Promise<void>;
  typeText(text: string, note?: string): Promise<void>;
  pressKey(chord: string, note?: string): Promise<void>;
}
