import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  new URL("../app/(app)/(tabs)/index.tsx", import.meta.url),
  "utf8",
);
const styles = screen.slice(screen.indexOf("const styles"));
describe("Dictation home layout", () => {
  it("opens directly into dictation with history and account access", () => {
    expect(screen).toContain('accessibilityLabel="Open history"');
    expect(screen).not.toContain("useRemixThread");
    expect(screen).not.toContain("ModeSwitch");
    expect(screen).toContain("signedIn: signedIn && focused");
  });
  it("retains account settings and the dictation voice dock", () => {
    expect(screen).toMatch(/accessibilityLabel="Open account and settings"/);
    expect(screen).toMatch(/styles\.dictationStage/);
    expect(screen).toMatch(/styles\.dictationDock/);
    expect(styles).toMatch(/borderTopLeftRadius: 38/);
    expect(styles).toMatch(/borderBottomLeftRadius: 38/);
  });

  it("keeps the transcript and voice dock visible", () => {
    expect(screen.replace(/\s+/g, " ")).toContain(
      "Speak naturally. Freestyle keeps the words clear and ready to use.",
    );
    expect(screen).toContain('placeholder="Your words will appear here."');
    expect(styles).toMatch(
      /dictationDock:[\s\S]*?borderTopWidth: StyleSheet\.hairlineWidth/,
    );
  });
});
