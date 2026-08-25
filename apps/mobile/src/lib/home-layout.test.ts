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
    expect(styles).toMatch(
      /modeSwitch:\s*\{[\s\S]*?flexDirection:\s*"row"[\s\S]*?\n {2}\},\n {2}modeOption:/,
    );
  });

  it("balances the session menu with account settings and gives Dictate its own voice dock", () => {
    expect(screen).toMatch(/accessibilityLabel="Open account and settings"/);
    expect(screen).toMatch(/styles\.dictationStage/);
    expect(screen).toMatch(/styles\.dictationDock/);
    expect(styles).toMatch(/borderTopLeftRadius: 38/);
    expect(styles).toMatch(/borderBottomLeftRadius: 38/);
  });

  it("keeps Dictate as a quiet, chat-adjacent voice surface rather than another card stack", () => {
    expect(screen).toMatch(
      /Speak naturally\. Freestyle keeps the words clear and\s+ready to use\./,
    );
    expect(screen).toContain('placeholder="Your words will appear here."');
    expect(styles).toMatch(
      /dictationDock:[\s\S]*?borderTopWidth: StyleSheet\.hairlineWidth/,
    );
  });

  it("dismisses the keyboard before opening the session drawer", () => {
    expect(screen).toMatch(
      /const openSidebar[\s\S]*?Keyboard\.dismiss\(\)[\s\S]*?setSidebarOpen\(true\)/,
    );
    expect(screen).toMatch(/onPress=\{openSidebar\}/);
  });

  it("keeps the system keyboard up while inline voice listening begins", () => {
    expect(screen).toMatch(
      /case "listen":[\s\S]*?toggleVoiceInput\(\);[\s\S]*?inputRef\.current\?\.focus\(\)/,
    );
    expect(screen).not.toMatch(
      /function RemixHome[\s\S]*?case "listen":[\s\S]*?Keyboard\.dismiss\(\)/,
    );
  });

  it("grows the composer through four lines before enabling its input scroll", () => {
    expect(screen).toContain("onContentSizeChange={onInputContentSizeChange}");
    expect(screen).toContain(
      "scrollEnabled={inputHeight >= REMIX_COMPOSER_MAX_INPUT_HEIGHT}",
    );
  });

  it("keeps an interrupted thread recoverable with durable drafts and retry", () => {
    expect(screen).toContain("loadRemixDrafts(userId)");
    expect(screen).toContain("Retry last Remix message");
    expect(screen).toContain("retryLastTurn()");
  });
});
