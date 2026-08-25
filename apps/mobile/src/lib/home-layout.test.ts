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

  it("opens an explicitly selected conversation at its newest message", () => {
    expect(screen).toContain("const transcriptRef = useRef<ScrollView>(null)");
    expect(screen).toContain(
      "pendingThreadEndScrollRef.current = selectedThreadId",
    );
    expect(screen).toContain(
      "transcriptRef.current?.scrollToEnd({ animated: false })",
    );
    expect(screen).toContain("ref={transcriptRef}");
  });

  it("keeps the system keyboard up while inline voice listening begins", () => {
    expect(screen).toMatch(
      /case "listen":[\s\S]*?toggleVoiceInput\(\);[\s\S]*?inputRef\.current\?\.focus\(\)/,
    );
    expect(screen).not.toMatch(
      /function RemixHome[\s\S]*?case "listen":[\s\S]*?Keyboard\.dismiss\(\)/,
    );
  });

  it("labels the square control as a server-authoritative Remix stop", () => {
    expect(screen).toContain(
      "Stops this Remix response and cancels its server turn.",
    );
  });

  it("grows the composer through four lines before enabling its input scroll", () => {
    expect(screen).toContain("onContentSizeChange={onInputContentSizeChange}");
    expect(screen).toContain(
      "scrollEnabled={inputHeight >= REMIX_COMPOSER_MAX_INPUT_HEIGHT}",
    );
    expect(screen).toMatch(
      /style=\{\[\s*styles\.input,\s*\{ color: theme\.foreground, height: inputHeight \},\s*\]\}/,
    );
    expect(screen).not.toContain("styles.inputViewport");
    expect(styles).toMatch(/textAlignVertical: "top"/);
  });

  it("resets a cleared controlled draft and ignores redundant resize events", () => {
    expect(screen).toContain(
      "if (!draft) setInputHeight(REMIX_COMPOSER_MIN_INPUT_HEIGHT);",
    );
    expect(screen).toContain(
      "currentHeight === nextHeight ? currentHeight : nextHeight",
    );
  });

  it("does not feed the imposed composer height back into native content measurement", () => {
    expect(screen).not.toContain(
      "<View style={[styles.inputViewport, { height: inputHeight }]}>",
    );
    expect(screen).toContain('underlineColorAndroid="transparent"');
  });

  it("clears the composer as soon as the server accepts a turn, not after Remix finishes", () => {
    expect(screen).toMatch(
      /const clearAcceptedDraft = \(\) => \{[\s\S]*?setDraft\(""\);[\s\S]*?setEditingMessage\(null\);/,
    );
    expect(screen).toMatch(
      /await resend\(editingMessage\.id, draft, clearAcceptedDraft\)/,
    );
    expect(screen).toMatch(/await send\(draft, clearAcceptedDraft\)/);
  });

  it("keeps live dictation inside the composer flow instead of covering the draft", () => {
    expect(screen).toContain("<View style={styles.composerInputRow}>");
    expect(styles).not.toMatch(/voiceStatus:[\\s\\S]*?position: "absolute"/);
    expect(styles).not.toMatch(/voiceStatus:[\\s\\S]*?zIndex:/);
  });

  it("uses a quiet shimmer for active Remix work instead of a status pill", () => {
    expect(screen).toContain("<RemixWorkingIndicator label={activeTool} />");
    expect(styles).not.toMatch(
      /toolStatus:\s*\{[\s\S]*?borderRadius: Radius\.full/,
    );
  });

  it("keeps server-side tool calls visible in the assistant transcript", () => {
    expect(screen).toContain("import { MobileToolActivity }");
    expect(screen).toContain('if (part.type.startsWith("tool-"))');
    expect(screen).toContain(
      "<MobileToolActivity key={index} parts={group} />",
    );
  });

  it("uses the desktop conversation hierarchy instead of framing every message", () => {
    expect(screen).toContain(
      "<StarterPrompts busy={busy} onPrompt={sendStarter} />",
    );
    expect(screen).toContain('if (message.role === "user")');
    expect(screen).toMatch(
      /<View\s+key=\{message\.id\}\s+style=\{styles\.userMessageGroup\}>/,
    );
    expect(styles).toMatch(/userMessageGroup:[\s\S]*?alignSelf: "flex-end"/);
    expect(styles).toMatch(/assistantTurn:[\s\S]*?alignSelf: "stretch"/);
    expect(styles).not.toMatch(/turn: \{[\s\S]*?borderWidth:/);
  });

  it("places user message actions below the bubble instead of inside its text surface", () => {
    expect(screen).toMatch(
      /style=\{styles\.userMessageGroup\}>[\s\S]*?styles\.userTurn[\s\S]*?\{actions\}/,
    );
  });

  it("uses compact icon actions rather than text action chips", () => {
    expect(screen).toContain(
      "<Copy color={theme.mutedForeground} size={15} />",
    );
    expect(screen).toContain(
      "<Pencil color={theme.mutedForeground} size={15} />",
    );
    expect(screen).toContain(
      "<RefreshCw color={theme.mutedForeground} size={15} />",
    );
  });

  it("keeps an interrupted thread recoverable with durable drafts and retry", () => {
    expect(screen).toContain("loadRemixDrafts(userId)");
    expect(screen).toContain("Retry last Remix message");
    expect(screen).toContain("retryLastTurn()");
  });
});
