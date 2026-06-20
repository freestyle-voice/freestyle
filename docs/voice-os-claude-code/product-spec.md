# Freestyle Voice OS for Claude Code — Product Spec

**Status:** Draft for review · **Owner:** Matthew Wang · **Date:** 2026-06-18
**Companion docs:** [`overview.md`](./overview.md) (original vision)

> This is a **product** spec. It defines *what* we're building, *why*, the product
> decisions we've locked, and how the work decomposes into independently-shippable
> parts. It deliberately avoids implementation detail — that belongs in the
> per-part technical specs this document is meant to seed.

---

## 1. Vision

Extend Freestyle from a best-in-class voice **dictation** app into a **Voice OS
for Claude Code**: a always-available, voice-first interface to a Claude Code
agent that can read, reason about, and act on the user's machine. Hold a hotkey,
speak an instruction, optionally clean it up, send it — and watch the agent work,
all without a hard dependency on the mouse and keyboard.

Freestyle already owns the hard OS-level primitives this requires — a global
hotkey, a focus-stealing-free always-on overlay, native cross-platform
paste/keystroke synthesis, frontmost-app/browser-tab context capture, and a
voice cleanup pipeline. The Voice OS is a layer on top of that foundation.

## 2. Goals & Non-Goals

### Goals
- Let a user trigger a Claude Code agent **by voice** from anywhere on their machine.
- Let the user **review and edit** the transcribed instruction before it runs (voice is lossy; agents are powerful).
- Stream the agent's work in an **always-on bar**, with multiple sessions visible (running / queued / past).
- Give the agent **desktop awareness and reach** (screen, frontmost app, paste, keystrokes) safely.
- Preserve the existing dictation experience **unchanged** — the Voice OS is additive.
- Reuse Freestyle's existing architecture: BYOK keys, embedded server, IPC seams, MCP server.

### Non-Goals (v1)
- Replacing the Claude Code desktop/CLI experience for power users.
- Fully autonomous, unattended computer control (taking the mouse with no confirmation).
- Cross-machine / cloud-hosted agents. Agents run locally against the local CLI.
- Storing agent transcripts in Freestyle's own database (we read Claude Code's on-disk transcripts).
- Non–Claude-Code agent backends (OpenAI, etc.). Claude Code only for v1.

## 3. Locked product decisions

These are settled based on validation done during planning. They shape every part below.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Support both auth paths: (primary) the user's Claude subscription via the logged-in `claude` CLI, and (fallback) a BYOK Anthropic API key.** | Per Anthropic's support article ([source](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), as of 2026-06-18): Agent SDK usage — *explicitly including third-party apps* — currently **draws from the user's Claude subscription usage limits**. This revives the "use your existing Claude subscription, no new bill" pitch (eligible: Pro/Max/Team/Enterprise). A planned change (separate monthly Agent SDK credit + overflow at API rates, eff. June 15 2026) was **announced then paused** → policy is in active flux, see R1. BYOK API key stays as the fallback for API-key accounts, predictable metered billing, or when subscription limits are exhausted. |
| D2 | **Usage/cost visibility is a first-class UI element.** Show subscription-limit consumption on the subscription path; show token cost on the API-key path. | Subscription runs draw down the user's Claude usage limits (token-heavy agent runs can exhaust them fast); API-key runs are metered pay-as-you-go. Either way the user must see the running impact in the bar. |
| D3 | **Use Anthropic's computer-use tool for the model's vision→action loop, but supply our *own actuator* that drives the real desktop** — built on Freestyle's native input/screenshot primitives. | The computer-use tool only *emits structured action requests* (`screenshot`, `left_click [x,y]`, `type`, …); the developer implements execution and feeds back the next screenshot. Anthropic ships only a Docker/Xvfb *reference* actuator and *recommends* sandboxing, but imposes **no technical restriction** on targeting the real machine. We already own cross-platform keystroke/paste/context capture and add screen capture. We inherit the prompt-injection / blast-radius risks Anthropic warns about → Part E. |
| D4 | **Default to plan/confirm, not autonomous action.** Destructive or high-blast-radius tools require explicit confirmation (voice or click). | Voice is lossy; an agent with Bash + real Gmail + mouse control is high-risk. SDK `permissionMode` (`plan`, `default`, `dontAsk`, `auto`) supports this. **⚠️ OVERRIDDEN in the Phase 0 build (owner decision):** that build runs `permissionMode: "bypassPermissions"` with the full `claude_code` tool preset — no approval gate. Part E then becomes a *re-introduction* of gating, not a removal. |
| D5 | **The Agent Bar is a separate window from the dictation pill.** | The pill is intentionally `focusable: false` / non-interactive so it never steals focus during dictation. The bar needs focus, a text input, and scroll. One window can't be both. |
| D6 | **Two distinct hotkeys.** Globe/Fn = dictation (unchanged). A second hotkey = agent query. | Stated requirement; keeps the dictation muscle-memory intact. |
| D7 | **Agent runs are scoped to a working directory (project).** | Claude Code is cwd/project-scoped; transcripts are stored per-project. cwd resolution is an explicit product concern, not an afterthought. |

## 4. Core use cases

1. **Speak a coding task into a project.** "Look at this spec and write an implementation plan" → agent runs in the chosen repo, streams its plan in the bar.
2. **Refine before running.** User speaks, sees the transcribed query, dictates a correction, then sends.
3. **Guided desktop help (narrate-first).** "Where do I buy a domain on Vercel?" → agent screenshots the screen and narrates/points, before ever clicking.
4. **Connector queries.** "What meetings do I have today?" → agent uses Claude Code's existing MCP connectors (Gmail/Calendar).
5. **Resume a past session.** User reopens a prior conversation from the bar and continues by voice.

---

## 5. Project decomposition

The project splits into **eight parts**. Each is independently specifiable and
(mostly) independently shippable. Dependencies are noted. The first three
(A, B, C) form the minimum end-to-end loop; the rest layer on capability and safety.

```
            ┌─────────────────────────────────────────────┐
   voice →  │  B. Voice→Query Input   │  C. Agent Bar (UI)  │
            └───────────┬─────────────┴──────────┬──────────┘
                        │                         │
                        ▼                         ▼
            ┌─────────────────────────────────────────────┐
            │        A. Agent Session Engine (backend)      │
            └───┬───────────┬──────────────┬───────────┬────┘
                ▼           ▼              ▼           ▼
            D. Desktop   E. Perms &    F. Auth,     G. Sessions
            Tools (MCP)  Safety        Billing,     & History
                                       Cost
            ┌─────────────────────────────────────────────┐
            │     H. Voice-native interaction (later)       │
            └─────────────────────────────────────────────┘
```

---

### Part A — Agent Session Engine (backend)

**Purpose:** Own the lifecycle of Claude Code agent runs. The core new subsystem.

**What it does (product behavior):**
- Spawns, tracks, streams, cancels, and resumes agent sessions backed by the Claude Agent SDK / local `claude` CLI.
- Supports **multiple concurrent sessions** (running, queued) and exposes their state.
- Streams agent events (assistant text, tool calls, tool results, progress, completion, errors) to the UI in real time.
- Resolves and enforces the **working directory** for each session (see D7).

**Scope boundaries:** No UI. No tool definitions (those are Part D). No permission *policy* (Part E decides; A enforces the callback wiring).

**Dependencies:** Part F (auth/key) must supply credentials. Pattern-aligns with how the server already manages whisper/mlx subprocesses and streams over WebSocket.

**Open questions:**
- Lives in the embedded server (consistent with `/stream` WS pattern) or the main process (which already owns subprocess lifecycle)? *Lean: server, streamed over a new WS route.*
- Queue semantics: how many parallel runs? Per-project serialization?
- cwd resolution strategy: explicit project picker vs. frontmost-app inference vs. last-used.

---

### Part B — Voice → Query Input flow

**Purpose:** Turn the agent hotkey + speech into an editable, sendable instruction.

**What it does:**
- Registers the **second hotkey** (D6) distinct from dictation.
- On release, transcribes speech and **places it in an editable text input** — does *not* auto-send (per overview requirement).
- User can re-dictate to refine, edit by keyboard, scrap entirely, or send (Enter).
- The transcribed query is **cleaned through Freestyle's existing post-processing/dictionary pipeline** — our unfair advantage for this step.

**Scope boundaries:** Owns capture → editable text → "send" event. Handing the query to a session belongs to Part A; rendering the input belongs to Part C.

**Dependencies:** Reuses existing recorder/streaming-STT + post-processing. Needs the bar's input surface from Part C.

**Open questions:**
- Does re-dictation *append* or *replace* selection? How is dictation-into-the-input disambiguated from agent-trigger?
- Behavior if the user sends an empty/garbled query.

---

### Part C — The Always-On Agent Bar (UI)

**Purpose:** The persistent, low-profile surface for interacting with and observing agents.

**What it does:**
- A thin bar fixed to the bottom of the screen, always available, one hotkey away.
- **Collapsed:** minimal footprint showing active-agent status. **Expanded (on hover/focus):** the query input, the streaming conversation (like CC desktop), and the list of running/queued/past sessions.
- Renders streamed agent output: assistant text, tool calls/results, plans, progress, cost (D2), and confirmation prompts (Part E).
- Must not "take up the entire screen" — information-dense but unobtrusive.

**Scope boundaries:** Pure presentation + interaction. Talks to A over the streaming channel; B owns the capture logic feeding the input.

**Dependencies:** New **focusable** window (D5), separate from the pill. Reuses the existing shadcn component system.

**Open questions:**
- One bar window with collapsed/expanded states, or a bar + a separate expanded panel?
- Multi-monitor placement; interaction with the existing pill's positioning logic.
- How much conversation history renders inline vs. in an opened session view.

---

### Part D — Desktop Tools (via MCP)

**Purpose:** Give the agent "eyes and hands" on the *real* desktop, safely. Anthropic's computer-use tool emits the *intended actions*; **we own the actuator** that executes them against the live machine (D3). Freestyle is unusually well-positioned because the actuator primitives already exist.

**What it does:**
- Provides the **actuator** for the computer-use action set: capture a screenshot of the real screen, move/click the pointer, type text, press keys — returning a fresh screenshot after each action so the model's loop can continue.
- Provides richer **context tools**: frontmost-app + browser-tab context, paste-at-cursor, and Freestyle-specific tools (dictionary/formats/history already exist in `apps/server/src/routes/mcp.ts`).
- Two viable mechanisms to settle in the tech spec: **(a)** register Anthropic's native `computer_*` tool and route its actions to our actuator, or **(b)** define custom in-process tools via the SDK's MCP server (`createSdkMcpServer` / `tool()`). (a) gets the model's tuned spatial reasoning; (b) gives us full control over the tool surface. Likely **(a) for pointer/screen + (b) for Freestyle-specific tools.**
- Phased capability: **read/observe first** (screenshot, context), **act later** (click, type) behind Part E gates.

**Scope boundaries:** Defines and implements tools + the actuator. It does not decide *when* the agent may use them (Part E) nor host the agent loop (Part A).

**Dependencies:** Native binaries already in `apps/electron/native/` (paste, key listener, etc.) — extend with screen capture + pointer synthesis. Strong coupling to Part E for any acting tool. Note model/beta requirement: computer use needs the `computer-use-*` beta header and a supporting model (Opus 4.6+, Sonnet 4.5/4.6, Haiku 4.5).

**Open questions:**
- Native computer-use tool (a) vs. custom MCP tools (b) per capability — confirm in tech spec.
- Screen capture permissions per OS (macOS Screen Recording prompt, Wayland constraints) — likely the hardest cross-platform piece.
- Pointer/click synthesis: build now or defer to a later phase?
- Does this MCP server also become connectable by the user's *own* external Claude Code (a separate distribution wedge)?

---

### Part E — Permissions & Safety

**Purpose:** Ensure a voice-triggered agent with real reach can't do damage from a misheard command (D4).

**What it does:**
- Default posture: **plan-first.** Agent proposes; the bar shows the plan; the user approves to proceed.
- **Tiered tool gating:** read-only tools auto-allowed; mutating/destructive tools (Bash that writes, sending email, file deletion, pointer control) require explicit confirmation.
- Confirmations surfaced in the bar and **confirmable by voice** ("confirm" / "go") or click.
- Audit trail of actions taken; clear stop/abort affordance.

**Scope boundaries:** Owns the *policy* and the confirmation UX contract. Wired into A's `canUseTool` / `permissionMode`; consumes D's tool metadata (which tools are dangerous).

**Dependencies:** A (enforcement hooks), C (confirmation UI), D (tool risk classification).

**Open questions:**
- Per-tool vs per-session permission memory ("always allow Bash in this project").
- How to resolve the tension between "hands-free" and "confirm before acting" — default to voice-confirm?
- Sensible defaults per tool category; user-configurable overrides.

---

### Part F — Auth, Billing & Cost Visibility

**Purpose:** Make both auth paths clean — subscription (primary) and BYOK API key (fallback) — and make usage/cost transparent (D1, D2).

**What it does:**
- **Prerequisite detection:** `claude` CLI installed; determine which auth is active.
- **Subscription path (primary):** the SDK spawns the installed, logged-in `claude` CLI, which carries the user's Claude subscription auth (Pro/Max/Team/Enterprise) — no extra key, draws from their subscription limits. If the CLI isn't logged in, guide the user to log in with their existing Claude account. Surface **subscription usage-limit consumption** so users see when agent runs are eating their Claude limits.
- **BYOK API-key path (fallback):** add/validate an Anthropic API key via the existing `api_keys` table flow (note: keys are currently stored *plaintext* — encryption-at-rest is a tracked cross-cutting follow-up, not specific to this feature); injected as `ANTHROPIC_API_KEY` into the spawned SDK/CLI env. Surfaces **per-session + cumulative token cost.** For API-key accounts, predictable billing, or when subscription limits run out.
- Let the user see and choose which path is active.

**Scope boundaries:** Credentials + usage/cost accounting. Does not run agents (A) or render the bar (C) beyond providing usage/cost data.

**Dependencies:** Extends existing key storage. Feeds A (credentials / auth mode) and C (usage/cost display).

**Open questions:**
- Auto-detect and prefer subscription when the CLI is logged in, or always let the user pick?
- Spend caps / budget alerts and subscription-limit warnings in v1 or later?
- Dedicated agent-key slot with one-tap reuse of an existing Anthropic key (per Q5 resolution).

---

### Part G — Sessions & History

**Purpose:** Browse, resume, and manage past agent conversations without a Freestyle-side datastore.

**What it does:**
- Lists past sessions by reading **Claude Code's on-disk JSONL transcripts** (per-project), via the SDK's session APIs (`listSessions` / `getSessionMessages`) where available.
- Lets the user reopen a session and **resume** it by voice.
- Surfaces session metadata: project/cwd, last activity, status, cost.

**Scope boundaries:** Read + resume of existing transcripts. New runs come from A; rendering from C.

**Dependencies:** A (resume), C (list/detail UI). No new DB tables (per non-goal).

**Open questions:**
- Project/cwd grouping in the UI (transcripts are cwd-hash-keyed on disk).
- Search across sessions; retention/cleanup expectations (SDK cleans subagent transcripts ~30 days).

---

### Part H — Voice-native interaction (later)

**Purpose:** The "JARVIS" layer — fluid, conversational voice that a keyboard-driven CC can't offer. Differentiator, not v1-critical.

**What it does:**
- **Read agent responses/plans aloud** (TTS).
- **Barge-in:** user interrupts or redirects by speaking mid-run.
- Voice-confirm destructive actions (ties into Part E).

**Scope boundaries:** A pure enhancement layer over A/C/E. Explicitly post-v1.

**Dependencies:** A (interrupt/redirect into a live session), E (voice-confirm), a TTS path.

**Open questions:** TTS provider/local; how barge-in maps to SDK streaming input; latency budget.

---

## 6. Phasing

| Phase | Parts | Outcome |
|-------|-------|---------|
| **0 — Voice-driven vertical slice** | B + C + A + F, each at *minimum real fidelity* (one session, fixed cwd, minimal bar, conservative permissions) | Agent hotkey → speak → transcript lands in an editable bar input → edit → send → one Claude agent runs and streams into the bar. Both auth paths work. **First usable artifact + validates D1.** See [`tech-spec-phase-0.md`](./tech-spec-phase-0.md). |
| **1 — Harden & expand the loop** | A (full), C (collapsed/expanded + polish), G (session list & resume), cwd picker | Multiple/queued sessions, session history from CC's transcripts, project picker, bar polish. **First demoable product.** |
| **2 — Safe reach** | D (read/observe tools), E (plan-mode + gating), F (cost UI) | Agent can see the screen and use context; acts only with confirmation; cost is visible. Covers the "guide me through Vercel" (narrate-first) use case. |
| **3 — Acting & polish** | D (pointer/act tools), E (advanced gating), H (TTS, barge-in) | Agent can take controlled action on the desktop; conversation becomes voice-native. |

## 7. Top risks

- **R1 (policy in flux): subscription billing for the Agent SDK.** As of 2026-06-18, third-party Agent SDK usage *draws from the user's Claude subscription limits* — the original "use your existing subscription" pitch works today. But Anthropic **announced then paused** (June 15 2026) a change that would separate this into a metered monthly credit with overflow at API rates; it could be reintroduced or revised. Mitigation: support BYOK API key as a first-class fallback (D1), don't hard-couple the product to subscription auth, track Anthropic's announcements, and re-confirm before public "uses your existing subscription" messaging. Also: subscription *usage limits* apply now — heavy agent runs can exhaust a user's Claude limits, so surface consumption (D2).
- **R2: safety blast radius.** Voice + autonomy + real desktop reach. Part E must land before any acting tools ship (Phase 2 before 3).
- **R3: scope/product drift.** This is a pivot from "dictation utility" to "agent OS." Guard the dictation core (latency/accuracy/cross-platform) — it's the moat the agent layer sits on.
- **R4: focus/window model.** The bar must coexist with the pill without breaking the pill's never-steal-focus property (D5).
- **R5: cross-platform desktop tools.** Screen capture + input synthesis behave differently across macOS/Windows/Wayland; Part D parity is non-trivial.

## 8. Success signals

- A user completes a real coding task end-to-end by voice without touching the keyboard except to edit.
- The narrate-first guided-help flow works on a live third-party dashboard.
- Zero "the agent did something destructive I didn't approve" incidents.
- Per-run cost is always visible; no surprise bills.
- Dictation latency/accuracy unchanged by the new feature set.

---

## 9. Open product questions to resolve before the technical spec

1. **cwd/project model:** explicit picker, frontmost-app inference, or both? (Blocks A, G.)
2. **Engine home:** embedded server vs. main process. (Blocks A.)
3. **Bar window shape:** single window w/ states vs. bar + panel. (Blocks C.)
4. **Confirmation default:** voice-confirm vs. click-confirm vs. per-tool. (Blocks E.)
5. **Key reuse:** shared Anthropic key with dictation, or dedicated agent key. (Blocks F.)
6. **MCP exposure:** internal-only, or also connectable by the user's external Claude Code. (Affects D's value/scope.)
