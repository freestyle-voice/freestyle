/**
 * macOS desktop actuator.
 *
 * Input:   `cliclick` (bundled binary, or Homebrew/PATH for dev) for mouse +
 *          typing; AppleScript `System Events` for key presses (cliclick's
 *          `kp:` silently no-ops on macOS 26, so named keys go through
 *          System Events `key code`, the same path the app uses for paste).
 * Capture: `screencapture` + `sips` (always present), downscaled to the
 *          display's logical size so the model's coordinates line up 1:1.
 *
 * macOS gates the syscalls behind separate TCC permissions:
 *   - Accessibility    → cliclick / System Events can actuate (else no-op)
 *   - Screen Recording → screencapture returns real pixels (else a black frame)
 * Neither can be granted programmatically; we can only read state and (for
 * Screen Recording) trigger the first-run prompt by attempting a capture.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppLogger } from "@freestyle/utils";
import type { ComputerUsePrereqs, PrereqState } from "@freestyle/validations";
import { screen, systemPreferences } from "electron";
import { getNativeBinaryPath } from "../../native-binary.js";
import type {
  DesktopActuator,
  DesktopCapabilities,
  HelperResult,
  MouseButton,
  Screenshot,
  SelfTestResult,
} from "./types.js";

const log = createAppLogger("agent-computer");

const SCREENCAPTURE = "/usr/sbin/screencapture";
const SIPS = "/usr/bin/sips";
const OSASCRIPT = "/usr/bin/osascript";

function run(cmd: string, args: string[], timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { encoding: "utf-8", timeout: timeoutMs },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(String(stdout).trim());
      },
    );
  });
}

// ---- key chords → AppleScript System Events --------------------------------
// cliclick's `kp:` no-ops on macOS 26, so named keys use `key code` and single
// characters use `keystroke` (so modifiers form real shortcuts).
const MOD_MAP: Record<string, string> = {
  cmd: "command down",
  command: "command down",
  ctrl: "control down",
  control: "control down",
  alt: "option down",
  option: "option down",
  opt: "option down",
  shift: "shift down",
};
const APPLE_KEY_CODES: Record<string, number> = {
  return: 36,
  enter: 76, // numeric-keypad Enter
  esc: 53,
  escape: 53,
  tab: 48,
  space: 49,
  delete: 51,
  backspace: 51,
  del: 51,
  "fwd-delete": 117,
  fwddelete: 117,
  forwarddelete: 117,
  up: 126,
  "arrow-up": 126,
  down: 125,
  "arrow-down": 125,
  left: 123,
  "arrow-left": 123,
  right: 124,
  "arrow-right": 124,
  home: 115,
  end: 119,
  pageup: 116,
  "page-up": 116,
  pagedown: 121,
  "page-down": 121,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

/** Build an AppleScript that presses a key/chord via System Events. */
function buildKeystrokeScript(chord: string): string {
  const parts = chord
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) throw new Error("empty key chord");
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((m) => {
    const apple = MOD_MAP[m];
    if (!apple) throw new Error(`unsupported modifier: ${m}`);
    return apple;
  });

  let action: string;
  if (key.length === 1) {
    const esc = key.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    action = `keystroke "${esc}"`;
  } else {
    const code = APPLE_KEY_CODES[key];
    if (code === undefined) throw new Error(`unknown key: ${key}`);
    action = `key code ${code}`;
  }

  const using = mods.length ? ` using {${mods.join(", ")}}` : "";
  return `tell application "System Events" to ${action}${using}`;
}

const HELPER_MISSING =
  "Desktop-control helper (cliclick) isn't installed. Click “Install helper”.";

export class MacActuator implements DesktopActuator {
  readonly platform: NodeJS.Platform = "darwin";
  readonly actuation = "direct" as const;

  // `undefined` = not yet probed, `null` = probed and absent, string = path.
  private cliclickPath: string | null | undefined;

  capabilities(): DesktopCapabilities {
    return {
      screenshot: true,
      mouseMove: true,
      click: true,
      doubleClick: true,
      typeText: true,
      pressKey: true,
    };
  }

  // ---- helper discovery / install ----
  private async findCliclick(): Promise<string | null> {
    if (this.cliclickPath !== undefined) return this.cliclickPath;
    const bundled = getNativeBinaryPath("cliclick");
    const candidates = [
      ...(bundled ? [bundled] : []),
      "/opt/homebrew/bin/cliclick",
      "/usr/local/bin/cliclick",
      "cliclick",
    ];
    for (const p of candidates) {
      try {
        await run(p, ["-V"], 4000);
        this.cliclickPath = p;
        return p;
      } catch {
        // try next
      }
    }
    this.cliclickPath = null;
    return null;
  }

  private async findBrew(): Promise<string | null> {
    for (const p of ["/opt/homebrew/bin/brew", "/usr/local/bin/brew", "brew"]) {
      try {
        await run(p, ["--version"], 4000);
        return p;
      } catch {
        // try next
      }
    }
    return null;
  }

  async ensureHelper(): Promise<HelperResult> {
    this.cliclickPath = undefined; // re-probe (bundled binary may have appeared)
    if (await this.findCliclick()) return { ok: true };

    const brew = await this.findBrew();
    if (!brew) {
      return {
        ok: false,
        reason:
          "Homebrew not found. Install Homebrew from https://brew.sh and retry, or use a Freestyle build that bundles the helper.",
      };
    }
    try {
      log.info("installing cliclick via Homebrew…");
      await run(brew, ["install", "cliclick"], 180000);
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
    this.cliclickPath = undefined;
    return (await this.findCliclick())
      ? { ok: true }
      : {
          ok: false,
          reason: "Install completed but cliclick still wasn't found.",
        };
  }

  // ---- permissions ----
  private accessibilityState(): PrereqState {
    // `false` = probe without popping the prompt. We can't distinguish
    // "not-determined" from "denied" via this API, so report both as "denied".
    return systemPreferences.isTrustedAccessibilityClient(false)
      ? "ok"
      : "denied";
  }

  private screenRecordingState(): PrereqState {
    switch (systemPreferences.getMediaAccessStatus("screen")) {
      case "granted":
        return "ok";
      case "denied":
      case "restricted":
        return "denied";
      default:
        return "unknown";
    }
  }

  async prereqs(): Promise<ComputerUsePrereqs> {
    const helper: PrereqState = (await this.findCliclick()) ? "ok" : "missing";
    const accessibility = this.accessibilityState();
    const screenRecording = this.screenRecordingState();

    let reason: string | undefined;
    if (helper !== "ok") {
      reason = HELPER_MISSING;
    } else if (accessibility !== "ok") {
      reason =
        "Freestyle needs macOS Accessibility permission to control the mouse and keyboard.";
    } else if (screenRecording !== "ok") {
      reason =
        "Freestyle needs macOS Screen Recording permission to see the screen.";
    }

    return {
      ok: helper === "ok" && accessibility === "ok" && screenRecording === "ok",
      platformSupported: true,
      helper,
      accessibility,
      screenRecording,
      reason,
    };
  }

  async requestPermissions(): Promise<ComputerUsePrereqs> {
    // There's no askForMediaAccess("screen"); the only way to surface the
    // dialog (and add Freestyle to the Screen Recording list) is to attempt a
    // capture. Swallow failure — the attempt is the point.
    try {
      await this.screenshot();
    } catch {
      // expected when permission is absent
    }
    return this.prereqs();
  }

  // ---- self-test ----
  async selfTest(): Promise<SelfTestResult> {
    const p = await this.prereqs();
    if (!p.ok)
      return { ok: false, details: p.reason ?? "prerequisites not met" };
    // Verifies the capture path end-to-end (Screen Recording perm +
    // screencapture + sips). A full input round-trip can't be exercised safely
    // without a scratch surface, so input is validated by prereqs + helper
    // reachability for now.
    try {
      const shot = await this.screenshot();
      if (!shot.data)
        return { ok: false, details: "screenshot returned no data" };
      return { ok: true, details: `capture ok (${shot.width}x${shot.height})` };
    } catch (e) {
      return {
        ok: false,
        details: `screenshot failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // ---- geometry ----
  private logicalSize(): { width: number; height: number } {
    const { width, height } = screen.getPrimaryDisplay().size;
    return { width: Math.round(width), height: Math.round(height) };
  }

  private clampX(x: number): number {
    return Math.max(0, Math.min(this.logicalSize().width - 1, Math.round(x)));
  }
  private clampY(y: number): number {
    return Math.max(0, Math.min(this.logicalSize().height - 1, Math.round(y)));
  }

  // ---- actions ----
  private async cliclick(args: string[]): Promise<void> {
    const path = await this.findCliclick();
    if (!path) throw new Error("cliclick unavailable");
    await run(path, args);
  }

  async screenshot(): Promise<Screenshot> {
    const { width, height } = this.logicalSize();
    const dir = mkdtempSync(join(tmpdir(), "fs-shot-"));
    const file = join(dir, "shot.png");
    try {
      // -x: silent, -D 1: main display.
      await run(SCREENCAPTURE, ["-x", "-D", "1", "-t", "png", file]);
      // Downscale the Retina capture to logical size so the image's pixel space
      // equals the logical coordinate space cliclick uses.
      await run(SIPS, ["-z", String(height), String(width), file]);
      const data = readFileSync(file).toString("base64");
      return { data, width, height };
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  }

  async moveCursor(x: number, y: number): Promise<void> {
    await this.cliclick([`m:${this.clampX(x)},${this.clampY(y)}`]);
  }

  async click(x: number, y: number, button: MouseButton): Promise<void> {
    const verb = button === "right" ? "rc" : "c";
    await this.cliclick([`${verb}:${this.clampX(x)},${this.clampY(y)}`]);
  }

  async doubleClick(x: number, y: number): Promise<void> {
    await this.cliclick([`dc:${this.clampX(x)},${this.clampY(y)}`]);
  }

  async typeText(text: string): Promise<void> {
    await this.cliclick([`t:${text}`]);
  }

  async pressKey(chord: string): Promise<void> {
    await run(OSASCRIPT, ["-e", buildKeystrokeScript(chord)]);
  }
}
