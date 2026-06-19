/**
 * Guided ("teaching") actuator.
 *
 * Wraps a real OS actuator but NEVER injects input. Instead of moving the
 * cursor or pressing keys, each action surfaces a ghost-cursor overlay + a
 * caption pointing the user to the step; the user performs it themselves. The
 * agent then takes a fresh screenshot to verify before continuing.
 *
 * Screenshots still come from the real backend (the agent must see the screen)
 * — but we hide the overlay during capture so the ghost cursor never pollutes
 * what the model sees.
 */
import type { ComputerUsePrereqs } from "@freestyle/validations";
import {
  hideGuidanceOverlay,
  showGuidance,
  withOverlayHidden,
} from "../../overlay.js";
import type {
  DesktopActuator,
  DesktopCapabilities,
  HelperResult,
  MouseButton,
  Screenshot,
  SelfTestResult,
} from "./types.js";

export class GuidanceActuator implements DesktopActuator {
  readonly platform: NodeJS.Platform;
  readonly actuation = "guided" as const;

  constructor(private readonly base: DesktopActuator) {
    this.platform = base.platform;
  }

  // Same tool palette as the underlying OS — the agent "clicks" and "types" the
  // same way; only the effect (overlay vs real input) differs.
  capabilities(): DesktopCapabilities {
    return this.base.capabilities();
  }

  async prereqs(): Promise<ComputerUsePrereqs> {
    const base = await this.base.prereqs();
    // Guided mode never actuates, so it needs neither the input helper nor
    // Accessibility — only screen capture, to see what to point at. Keep the
    // detailed fields for the settings UI, but don't block on input perms.
    const ok = base.screenRecording === "ok";
    return {
      ...base,
      ok,
      reason: ok
        ? undefined
        : "Freestyle needs Screen Recording permission to see the screen.",
    };
  }

  requestPermissions(): Promise<ComputerUsePrereqs> {
    return this.base.requestPermissions();
  }

  ensureHelper(): Promise<HelperResult> {
    // Not needed for guidance, but harmless to delegate (keeps the settings
    // "install helper" affordance working if the user later switches to full).
    return this.base.ensureHelper();
  }

  async selfTest(): Promise<SelfTestResult> {
    const p = await this.prereqs();
    if (!p.ok) {
      return { ok: false, details: p.reason ?? "prerequisites not met" };
    }
    try {
      const shot = await this.screenshot();
      return shot.data
        ? {
            ok: true,
            details: `guided capture ok (${shot.width}x${shot.height})`,
          }
        : { ok: false, details: "screenshot returned no data" };
    } catch (e) {
      return {
        ok: false,
        details: `screenshot failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  screenshot(): Promise<Screenshot> {
    // Hide the ghost cursor while capturing so the model sees a clean desktop.
    return withOverlayHidden(() => this.base.screenshot());
  }

  async moveCursor(x: number, y: number, note?: string): Promise<void> {
    showGuidance({ kind: "move", x, y, caption: note });
  }

  async click(
    x: number,
    y: number,
    button: MouseButton,
    note?: string,
  ): Promise<void> {
    showGuidance({
      kind: button === "right" ? "right_click" : "click",
      x,
      y,
      caption: note,
    });
  }

  async doubleClick(x: number, y: number, note?: string): Promise<void> {
    showGuidance({ kind: "double_click", x, y, caption: note });
  }

  async typeText(text: string, note?: string): Promise<void> {
    showGuidance({ kind: "type", text, caption: note });
  }

  async pressKey(chord: string, note?: string): Promise<void> {
    showGuidance({ kind: "key", text: chord, caption: note });
  }

  /** Called by the session lifecycle to clear the overlay when a run ends. */
  dismiss(): void {
    hideGuidanceOverlay();
  }
}
