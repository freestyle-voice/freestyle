import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  new URL("../app/(app)/(tabs)/index.tsx", import.meta.url),
  "utf8",
);
const styles = screen.slice(screen.indexOf("const styles"));

describe("Remix home layout", () => {
  it("keeps the full home shell keyboard-aware so the composer stays visible", () => {
    expect(screen).toMatch(
      /<KeyboardAvoidingView[\s\S]*?<SafeAreaView[\s\S]*?<ChatSidebar/,
    );
    expect(screen).not.toMatch(
      /function RemixHome[\s\S]*?<KeyboardAvoidingView/,
    );
  });

  it("centers the mode switch inside the top bar instead of the content column", () => {
    expect(screen).toMatch(
      /<View style=\{styles\.header\}>[\s\S]*?<ModeSwitch/,
    );
    expect(styles).not.toMatch(
      /modeSwitch:\s*\{[\s\S]*?position:\s*"absolute"/,
    );
  });

  it("dismisses the keyboard before opening the session drawer", () => {
    expect(screen).toMatch(
      /const openSidebar[\s\S]*?Keyboard\.dismiss\(\)[\s\S]*?setSidebarOpen\(true\)/,
    );
    expect(screen).toMatch(/onPress=\{openSidebar\}/);
  });
});
