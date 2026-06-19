/**
 * Backend selection for desktop control. `getActuator()` returns the right
 * `DesktopActuator` for the host OS (macOS today; Windows/Linux drop in here).
 * Unsupported platforms get a backend that advertises no capabilities and
 * fails closed, so callers never need their own `process.platform` checks.
 */
import type {
  ComputerUseMode,
  ComputerUsePrereqs,
} from "@freestyle/validations";
import { GuidanceActuator } from "./guidance-actuator.js";
import { MacActuator } from "./mac-actuator.js";
import type {
  DesktopActuator,
  DesktopCapabilities,
  HelperResult,
  Screenshot,
  SelfTestResult,
} from "./types.js";

const UNSUPPORTED =
  "Computer use isn't supported on this platform yet — macOS only for now.";

class UnsupportedActuator implements DesktopActuator {
  readonly platform: NodeJS.Platform = process.platform;
  readonly actuation = "direct" as const;

  capabilities(): DesktopCapabilities {
    return {
      screenshot: false,
      mouseMove: false,
      click: false,
      doubleClick: false,
      typeText: false,
      pressKey: false,
    };
  }

  async prereqs(): Promise<ComputerUsePrereqs> {
    return {
      ok: false,
      platformSupported: false,
      helper: "missing",
      accessibility: "denied",
      screenRecording: "denied",
      reason: UNSUPPORTED,
    };
  }

  async requestPermissions(): Promise<ComputerUsePrereqs> {
    return this.prereqs();
  }

  async ensureHelper(): Promise<HelperResult> {
    return { ok: false, reason: UNSUPPORTED };
  }

  async selfTest(): Promise<SelfTestResult> {
    return { ok: false, details: UNSUPPORTED };
  }

  async screenshot(): Promise<Screenshot> {
    throw new Error(UNSUPPORTED);
  }
  async moveCursor(): Promise<void> {
    throw new Error(UNSUPPORTED);
  }
  async click(): Promise<void> {
    throw new Error(UNSUPPORTED);
  }
  async doubleClick(): Promise<void> {
    throw new Error(UNSUPPORTED);
  }
  async typeText(): Promise<void> {
    throw new Error(UNSUPPORTED);
  }
  async pressKey(): Promise<void> {
    throw new Error(UNSUPPORTED);
  }
}

let baseActuator: DesktopActuator | undefined;

/** The raw OS actuator for this host, created once. */
function getBaseActuator(): DesktopActuator {
  if (!baseActuator) {
    baseActuator =
      process.platform === "darwin"
        ? new MacActuator()
        : new UnsupportedActuator();
  }
  return baseActuator;
}

/**
 * The actuator for the requested mode. `full` returns the OS actuator directly;
 * `guided` wraps it so actions become ghost-cursor guidance instead of real
 * input. Mode is read per call (cheap), so toggling it between runs takes effect
 * on the next run without a restart.
 */
export function getActuator(mode: ComputerUseMode = "full"): DesktopActuator {
  const base = getBaseActuator();
  return mode === "guided" ? new GuidanceActuator(base) : base;
}

export type {
  DesktopActuator,
  DesktopCapabilities,
  MouseButton,
  Screenshot,
  SelfTestResult,
} from "./types.js";
