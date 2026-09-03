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

  it("uses activity copy instead of a Remix label while the compact pill is working", async () => {
    const chat = await readFile(
      resolve(rendererRoot, "components/remix-chat.tsx"),
      "utf8",
    );
    const miniHeader = chat.slice(
      chat.indexOf('className="remix-mini-head"'),
      chat.indexOf('className="remix-mini-actions"'),
    );

    expect(miniHeader).toContain("miniIdentityLabel");
    expect(miniHeader).not.toContain("<span>Remix</span>");
  });

  it("notifies the workspace after each persisted pill response", async () => {
    const chat = await readFile(
      resolve(rendererRoot, "components/remix-chat.tsx"),
      "utf8",
    );

    expect(chat).toContain("onFinish: () => {");
    expect(chat).toContain("window.api?.remixThreadUpdated?.(thread.id)");
  });

  it("refreshes a new conversation title after Cloud has persisted it", async () => {
    const [panel, sessions] = await Promise.all([
      readFile(resolve(rendererRoot, "components/panel.tsx"), "utf8"),
      readFile(
        resolve(rendererRoot, "components/remix-session-context.tsx"),
        "utf8",
      ),
    ]);

    expect(panel).toContain("onThreadSettled?.(thread.id)");
    expect(sessions).toContain("THREAD_TITLE_REFRESH_DELAYS");
    expect(sessions).toContain("requestThreadTitleRefresh");
    expect(sessions).toContain("refreshThread(threadId)");
    expect(sessions).toContain(
      "titleRefreshTimersRef.current.delete(threadId)",
    );
    expect(sessions).toContain("current?.id === threadId ? loaded : current");
  });

  it("reconnects either Remix surface to the local server-owned stream", async () => {
    const [chat, panel] = await Promise.all([
      readFile(resolve(rendererRoot, "components/remix-chat.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "components/panel.tsx"), "utf8"),
    ]);

    expect(chat).toContain("resume: true");
    expect(panel).toContain("resume: true");
  });

  it("keeps queued follow-ups in the shared local queue across both Remix surfaces", async () => {
    const [chat, panel, queue] = await Promise.all([
      readFile(resolve(rendererRoot, "components/remix-chat.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "components/panel.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "lib/agent-message-queue.ts"), "utf8"),
    ]);

    expect(chat).toContain("AgentMessageQueueControls");
    expect(panel).toContain("AgentMessageQueueControls");
    expect(chat).toContain('capture("remix_message_queued"');
    expect(panel).toContain('capture("remix_message_queued"');
    expect(chat).toContain("return resumeStream()");
    expect(panel).toContain("return resumeStream()");
    expect(queue).toContain('method: "POST"');
    expect(queue).toContain("/steer");
  });

  it("uses the shared activity stream instead of periodic Remix polling", async () => {
    const [sessions, queue] = await Promise.all([
      readFile(
        resolve(rendererRoot, "components/remix-session-context.tsx"),
        "utf8",
      ),
      readFile(resolve(rendererRoot, "lib/agent-message-queue.ts"), "utf8"),
    ]);

    expect(sessions).toContain("subscribeToAgentThreadActivity");
    expect(sessions).not.toContain("setInterval");
    expect(queue).toContain('"/api/agent/activity/stream"');
    expect(queue).not.toContain("window.setInterval");
  });

  it("releases the pill observer when its session is handed to the workspace", async () => {
    const chat = await readFile(
      resolve(rendererRoot, "components/remix-chat.tsx"),
      "utf8",
    );

    expect(chat).toContain("onRemixObserverHandoff");
    expect(chat).toContain("stopRef.current()");
  });

  it("gives the expanded pill the same workspace handoff and a dedicated voice capture surface", async () => {
    const chat = await readFile(
      resolve(rendererRoot, "components/remix-chat.tsx"),
      "utf8",
    );

    expect(chat).toContain('aria-label="Open Remix workspace"');
    expect(chat).toContain("<RemixVoiceCaptureSurface");
    expect(chat).toContain('className="remix-chat-voice-capture"');
    expect(chat).not.toContain('className="remix-chat-voice-status"');
    expect(chat).toContain(
      'const placeholder = isListening ? "Listening…" : "Transcribing…"',
    );
    expect(chat).not.toContain("Keep holding the hotkey and speak naturally.");
    expect(chat).not.toContain("Release to send");
    expect(chat).not.toContain("remix-chat-voice-label");
    expect(chat).toContain("min-height: 44px;");
    expect(chat).toContain("props.voiceStatus === null ? (");
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

  it("pauses sensitive desktop actions for an explicit in-pill approval", async () => {
    const [chat, pill] = await Promise.all([
      readFile(resolve(rendererRoot, "components/remix-chat.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "pages/app.tsx"), "utf8"),
    ]);

    expect(chat).toContain('if (tier === "confirmed")');
    expect(chat).toContain('className="remix-chat-approval"');
    expect(chat).toContain("Remix wants to act locally");
    expect(chat).toContain("requestAgentFileSaveGrant(call)");
    expect(chat).toContain("DECLINED_OUTPUT");
    expect(chat).toContain('"Waiting for your approval"');
    expect(chat).toContain(
      "const resolvingApprovalRef = useRef<string | null>(null)",
    );
    expect(chat).toContain("if (resolvingApprovalRef.current) return;");
    expect(chat).toContain("resolvingApprovalRef.current = call.toolCallId;");
    expect(chat).toContain("resolving={resolvingApprovalId !== null}");
    expect(pill).toContain("const expandRemixChat = useCallback");
    expect(pill).toContain("onExpand={expandRemixChat}");
  });

  it("releases a follow-up microphone capture when that hotkey is only tapped", async () => {
    const pill = await readFile(resolve(rendererRoot, "pages/app.tsx"), "utf8");
    const tapBranchStart = pill.indexOf(
      "if (heldMs < REMIX_HOLD_THRESHOLD_MS) {",
    );
    const existingChatStart = pill.indexOf(
      "if (isRemixChatPhase(session.phase)) {",
      tapBranchStart,
    );
    const existingChatBranch = pill.slice(
      existingChatStart,
      pill.indexOf("return;", existingChatStart),
    );

    expect(existingChatBranch).toContain(
      "recorderRef.current.cancel(remixMicGenRef.current)",
    );
    expect(existingChatBranch).toContain(
      "recorderRef.current.releaseStream(remixMicGenRef.current)",
    );
    expect(existingChatBranch).toContain("remixMicGenRef.current = null");
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

  it("never turns a loading persisted session into a new conversation", async () => {
    const panel = await readFile(
      resolve(rendererRoot, "components/panel.tsx"),
      "utf8",
    );

    // useChat retains messages across an id change. The reset must happen in a
    // layout effect, before the first-message history effect can observe stale
    // messages from the previously selected conversation.
    expect(panel).toContain("useLayoutEffect");
    expect(panel).toContain(
      "startedRef.current = isSessionLoading || thread.messages.length > 0",
    );
  });

  it("uses rotating, shimmering pre-response copy instead of a static thinking label", async () => {
    const [chat, thinkingLabel] = await Promise.all([
      readFile(resolve(rendererRoot, "components/remix-chat.tsx"), "utf8"),
      readFile(
        resolve(
          rendererRoot,
          "components/agents/loading-states/rotating-thinking-label.tsx",
        ),
        "utf8",
      ),
    ]);

    expect(chat).toContain("<RotatingThinkingLabel");
    expect(thinkingLabel).toContain("REMIX_THINKING_MESSAGES");
    expect(thinkingLabel).toContain("Contemplating…");
    expect(thinkingLabel).toContain("One moment — bringing it together…");
    expect(thinkingLabel).toContain("setInterval");
    expect(thinkingLabel).toContain("2_600");
    expect(thinkingLabel).toContain("ThinkingShimmer");
    expect(chat).toContain("LoaderCircle");
    expect(chat).toContain("<RemixThinkingState />");
    expect(chat).not.toContain('<ThinkingShimmer className="remix-chat-busy">');
  });

  it("uses the same live shimmer in the workspace before the first response arrives", async () => {
    const panel = await readFile(
      resolve(rendererRoot, "components/panel.tsx"),
      "utf8",
    );

    expect(panel).toContain("RotatingThinkingLabel");
    expect(panel).toContain('aria-label="Remix is working"');
    expect(panel).toContain("tavern-stream-wait-signal");
    expect(panel).not.toContain('<Spark state="idle" size={11} />');
  });

  it("uses the complete recorded audio for a spoken Remix request", async () => {
    const pill = await readFile(resolve(rendererRoot, "pages/app.tsx"), "utf8");

    expect(pill).toContain("remixStreamerRef.current?.cancel();");
    expect(pill).toContain("if (!wav) {");
    expect(pill).not.toContain("new Promise<string>((resolve) => setTimeout");
  });

  it("cancels a server-owned Remix turn when the pill is closed", async () => {
    const chat = await readFile(
      resolve(rendererRoot, "components/remix-chat.tsx"),
      "utf8",
    );

    expect(chat).toContain("onCancelActive");
    expect(chat).toContain("getThreadRuntime(thread.id)");
    expect(chat).toContain("cancelDurableTurn(runtime.activeTurn.id)");
    expect(chat).toContain("cancellationRequestedRef.current = false");
  });
});
