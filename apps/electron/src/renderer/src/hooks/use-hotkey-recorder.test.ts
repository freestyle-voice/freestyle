import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Verbose key labels, on both platforms.
 *
 * Written after a review found the first attempt produced "Right ⌘ Right
 * Command" and "Ctrl Control": it composed symbol + word and used a substring
 * guard that missed the "Right " prefix and the Ctrl/Control mismatch. The
 * table below is the contract, so a future refactor that reintroduces
 * composition fails here instead of in someone's onboarding.
 */
async function loadWith(isMac: boolean) {
  vi.resetModules();
  vi.doMock("@renderer/lib/platform", () => ({
    IS_MAC: isMac,
    IS_WINDOWS: !isMac,
    IS_LINUX: false,
    PLATFORM: isMac ? "darwin" : "win32",
  }));
  return import("./use-hotkey-recorder");
}

beforeEach(() => {
  vi.resetModules();
});

describe("keyDisplayLabel verbose", () => {
  it("names macOS modifiers without duplicating the Right prefix", async () => {
    const { keyDisplayLabel } = await loadWith(true);
    const v = (k: string) => keyDisplayLabel(k, { verbose: true });

    expect(v("Fn")).toBe("🌐 Fn");
    expect(v("Command")).toBe("⌘ Command");
    expect(v("Alt")).toBe("⌥ Option");
    expect(v("Control")).toBe("⌃ Control");
    expect(v("Shift")).toBe("⇧ Shift");

    expect(v("RightCommand")).toBe("⌘ Right Command");
    expect(v("RightControl")).toBe("⌃ Right Control");
    expect(v("RightAlt")).toBe("⌥ Right Option");
    expect(v("RightShift")).toBe("⇧ Right Shift");
  });

  it("leaves Windows and Linux labels alone", async () => {
    const { keyDisplayLabel } = await loadWith(false);
    for (const key of ["Control", "Command", "Alt", "Shift", "Fn", "Space"]) {
      expect(keyDisplayLabel(key, { verbose: true })).toBe(
        keyDisplayLabel(key),
      );
    }
    // The pairing is a macOS affordance; these already read as words.
    expect(keyDisplayLabel("Control", { verbose: true })).toBe("Ctrl");
  });

  it("leaves non-modifier keys as their symbol on macOS", async () => {
    const { keyDisplayLabel } = await loadWith(true);
    // ␣ and ⎋ are the established legends, and their names are ordinary words
    // that would need translating. Only modifier legends get a name.
    expect(keyDisplayLabel("Space", { verbose: true })).toBe("␣");
    expect(keyDisplayLabel("Escape", { verbose: true })).toBe("⎋");
    expect(keyDisplayLabel("Right", { verbose: true })).toBe("→");
    expect(keyDisplayLabel("A", { verbose: true })).toBe("A");
  });

  it("is unchanged when verbose is not asked for", async () => {
    const { keyDisplayLabel } = await loadWith(true);
    expect(keyDisplayLabel("Fn")).toBe("🌐");
    expect(keyDisplayLabel("Command")).toBe("⌘");
    expect(keyDisplayLabel("RightCommand")).toBe("Right ⌘");
  });

  it("threads the option through a whole accelerator", async () => {
    const { formatAcceleratorKeys } = await loadWith(true);
    expect(formatAcceleratorKeys("Fn", { verbose: true })).toEqual(["🌐 Fn"]);
    expect(
      formatAcceleratorKeys("Control+Alt+Space", { verbose: true }),
    ).toEqual(["⌃ Control", "⌥ Option", "␣"]);
    // `.map` would pass the index as the second argument; the wrappers in
    // comboDisplayKeys exist to stop that turning into a silent verbose call.
    expect(formatAcceleratorKeys("Control+Alt+Space")).toEqual(["⌃", "⌥", "␣"]);
  });
});
