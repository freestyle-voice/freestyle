import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("Remix chat polish", () => {
  it("uses consistent action icons instead of text glyphs", async () => {
    const panel = await readFile(
      resolve(rendererRoot, "components/panel.tsx"),
      "utf8",
    );

    expect(panel).toContain("Copy");
    expect(panel).toContain("Pencil");
    expect(panel).toContain("RotateCcw");
    expect(panel).not.toContain('>{copied ? "✓" : "⧉"}</span>');
    expect(panel).not.toContain(">✎</span>");
    expect(panel).not.toContain(">↻</span>");
  });

  it("keeps the Remix composer to a single bordered surface", async () => {
    const styles = await readFile(
      resolve(rendererRoot, "remix-workspace.css"),
      "utf8",
    );

    expect(styles).toMatch(
      /\.remix-agent \.tavern-composer\s*\{[^}]*border:\s*1px solid var\(--border\);/s,
    );
    expect(styles).toMatch(
      /\.remix-agent \.tavern-input\s*\{[^}]*border:\s*0;/s,
    );
  });

  it("keeps the compact pill passive until the user explicitly opens Remix", async () => {
    const [chat, pill] = await Promise.all([
      readFile(resolve(rendererRoot, "components/remix-chat.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "pages/app.tsx"), "utf8"),
    ]);

    expect(chat).toContain('aria-label="Open Remix workspace"');
    expect(chat).toContain('aria-label="Close Remix"');
    expect(chat).toContain('className="remix-mini-head"');
    expect(chat).toContain('className="remix-mini-actions"');
    expect(chat).toContain('className="remix-mini-icon"');
    expect(chat).not.toContain(">Open</button>");
    expect(chat).not.toContain("onMouseEnter={props.onEnter}");
    expect(pill).toContain("window.api.openRemixWorkspace(threadId)");
    expect(pill).not.toContain("onPillHotEnter");
  });

  it("keeps the compact response scroller below a dedicated Remix top bar", async () => {
    const chat = await readFile(
      resolve(rendererRoot, "components/remix-chat.tsx"),
      "utf8",
    );

    expect(chat).toContain("MINI_STRIP_HEADER_HEIGHT = 44");
    expect(chat).toContain('.remix-mini[data-full="true"] .remix-mini-head');
    expect(chat).toContain(".remix-mini-message {");
    expect(chat).toContain(
      `max-height: \${MINI_STRIP_MAX - MINI_STRIP_HEADER_HEIGHT}px;`,
    );
    expect(chat).not.toContain('className="remix-mini-action"');
  });

  it("keeps a settled compact conversation available until the user ends it", async () => {
    const chat = await readFile(
      resolve(rendererRoot, "components/remix-chat.tsx"),
      "utf8",
    );

    expect(chat).toContain("const pointerOverChatRef = useRef(false)");
    expect(chat).toContain("onMouseLeave={handleMouseLeave}");
    expect(chat).not.toContain("MINI_SETTLED_DISMISS_MS");
    expect(chat).not.toContain("setTimeout(onClose");
  });

  it("does not minimize the expanded chat after a transient window mouseout while it is hovered", async () => {
    const chat = await readFile(
      resolve(rendererRoot, "components/remix-chat.tsx"),
      "utf8",
    );

    expect(chat).toContain("const pointerOverChatRef = useRef(false)");
    expect(chat).toContain("pointerOverChatRef.current = true");
    expect(chat).toContain("if (pointerOverChatRef.current) return;");
  });

  it("keeps a spoken hotkey request in the open pill conversation", async () => {
    const [chat, pill] = await Promise.all([
      readFile(resolve(rendererRoot, "components/remix-chat.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "pages/app.tsx"), "utf8"),
    ]);

    expect(pill).toContain("isRemixChatPhase(remixRef.current?.phase)");
    expect(pill).toContain('phase: "chat-capturing"');
    expect(pill).toContain("chatInstructions:");
    expect(pill).toContain("if (remixRef.current && !chatWasOpen)");
    expect(chat).toContain("queuedInstructions");
    expect(chat).toContain("onInstructionConsumed");
    expect(chat).toContain("voiceStatus");
  });

  it("promotes a compact conversation before recording a spoken follow-up", async () => {
    const [pill, chat] = await Promise.all([
      readFile(resolve(rendererRoot, "pages/app.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "components/remix-chat.tsx"), "utf8"),
    ]);
    const followUpStart = pill.indexOf("if (chatWasOpen) {");
    const followUpBranch = pill.slice(
      followUpStart,
      pill.indexOf("} else {", followUpStart),
    );

    expect(followUpBranch).toContain('phase: "chat-capturing"');
    expect(followUpBranch).toContain("minimized: false");
    expect(chat).toContain("const activeTurnRef = useRef(");
    expect(chat).toContain("if (activeTurnRef.current) return;");
  });

  it("drives a follow-up chat surface from the live Remix session", async () => {
    const pill = await readFile(resolve(rendererRoot, "pages/app.tsx"), "utf8");

    // A follow-up changes phase and expands in one render. Retaining a second
    // chat session or a second minimized flag lets the outer card, inner chat,
    // and window disagree and produces an empty surface.
    expect(pill).toContain(
      "const chatPresentation = resolveRemixChatPresentation(",
    );
    expect(pill).not.toContain("const [chatView, setChatView]");
    expect(pill).not.toContain("const [chatMiniVisual, setChatMiniVisual]");
  });

  it("keeps the compact pill and companion informed while Remix works", async () => {
    const [chat, pill] = await Promise.all([
      readFile(resolve(rendererRoot, "components/remix-chat.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "pages/app.tsx"), "utf8"),
    ]);

    expect(chat).toContain("onActivityChange");
    expect(chat).toContain("agentProgressLabel(messages, busy)");
    expect(chat).toContain("latestAssistantPreview(messages)");
    expect(chat).toContain("const message = messages.at(-1)");
    expect(chat).toContain("const miniProgress =");
    expect(pill).toContain("petStateFor");
    expect(pill).toContain("onActivityChange={handleRemixActivity}");
    expect(pill).toContain("setCompanionStatus");
  });

  it("keeps the full chat surface after a spoken follow-up is transcribed", async () => {
    const pill = await readFile(resolve(rendererRoot, "pages/app.tsx"), "utf8");
    const chatHandoff = pill.slice(
      pill.indexOf("if (isRemixChatPhase(session.phase)) {"),
      pill.indexOf(
        "return;",
        pill.indexOf("if (isRemixChatPhase(session.phase)) {"),
      ),
    );

    expect(chatHandoff).toContain('phase: "chat"');
    expect(chatHandoff).toContain("minimized: false");
    expect(chatHandoff).toContain("chatInstructions:");
  });

  it("uses rotating, shimmering pre-response copy instead of a static thinking label", async () => {
    const chat = await readFile(
      resolve(rendererRoot, "components/remix-chat.tsx"),
      "utf8",
    );

    expect(chat).toContain("REMIX_THINKING_MESSAGES");
    expect(chat).toContain("Contemplating…");
    expect(chat).toContain("One moment — bringing it together…");
    expect(chat).toContain("setInterval");
    expect(chat).toContain("2_600");
    expect(chat).toContain("LoaderCircle");
    expect(chat).toContain("<RemixThinkingState />");
    expect(chat).not.toContain('<ThinkingShimmer className="remix-chat-busy">');
  });

  it("uses the complete recorded audio for a spoken Remix request", async () => {
    const pill = await readFile(resolve(rendererRoot, "pages/app.tsx"), "utf8");

    expect(pill).toContain("remixStreamerRef.current?.cancel();");
    expect(pill).toContain("if (!wav) {");
    expect(pill).not.toContain("new Promise<string>((resolve) => setTimeout");
  });
});
