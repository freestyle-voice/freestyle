# Technical Spec — Phase 0: Voice-Driven Vertical Slice

**Status:** Proposal for review · **Owner:** Matthew Wang · **Date:** 2026-06-18
**Parent:** [`product-spec.md`](./product-spec.md) (Parts A, B, C, F)

> **Rescoped.** Phase 0 is now a **thin vertical slice through the real product**, not
> a plumbing-only milestone: *press the agent hotkey → speak → the transcript lands
> in an editable bar input → edit → send → a Claude agent runs and streams into the
> bar.* It cuts straight down through Parts B (voice trigger), C (bar UI), A (engine),
> and F (auth) — each at **minimum real fidelity**, not throwaway scaffolding.
>
> The tradeoff vs. the plumbing-first plan: we shake out the SDK/auth/packaging
> unknowns *and* the second-hotkey + focusable-window unknowns **together**. More
> moving parts at once, but the payoff is a genuinely usable artifact.

---

## 1. Scope

### In scope (each at minimum real fidelity)
- **Second hotkey** dedicated to the agent, distinct from the dictation hotkey (Part B).
- **Voice capture for the agent** that **reuses the existing dictation pipeline** (`Recorder` + `Streamer` + `/api/transcribe`), but routes the cleaned transcript into an **editable input instead of pasting** it.
- A **real (minimal) Agent Bar window** (Part C): focusable, separate from the pill, hosting the input + a live streaming view of the run.
- **Agent Session Engine** (Part A) in the main process: spawn one Claude agent, stream its events.
- **Both auth paths** (Part F): subscription via the logged-in `claude` CLI, or a BYOK Anthropic API key. This validates **D1**.

### Minimum-fidelity cuts (real, but deliberately small)
- **One** session at a time (no queue, no multi-session list, no resume-from-disk).
- **cwd** is a single configured project path (a setting + simple picker/text field) — no frontmost-app inference (Q1 says explicit anyway).
- Bar is **one window, one state** — no collapsed/expanded animation, no history browser, no polish pass.
- **Safety:** run the engine in a **conservative permission posture** (see §4.4) so the slice can't do damage. The full tiered permission UX (Part E) is still Phase 2.

### Explicitly NOT in scope
- Desktop tools / computer-use actuator (Part D, Phase 2–3).
- Tiered permission gating + confirmation UX (Part E, Phase 2).
- Multi/queued sessions, session list & resume (Part G, Phase 1+).
- TTS / barge-in (Part H, later).
- Cost/usage *UI polish* — Phase 0 plumbs raw usage numbers through and shows them plainly.

---

## 2. End-to-end flow

```
[Agent hotkey down] ──native listener #2──▶ main: emit "agent-hotkey:down" ─▶ Bar window
        speak…                                                                   │ getUserMedia + Streamer
[Agent hotkey up]   ──────────────────────▶ main: emit "agent-hotkey:up"   ─▶ commit → /api/transcribe
                                                                                  │
                                                       cleaned transcript ──▶ editable <textarea> in Bar
                                                                                  │  (user edits / scraps)
                                                       [Enter / Send] ──IPC "agent:start"──▶ main
                                                                                  │  AgentSessionManager.start()
                                                                                  ▼
                                                                       query() → spawn `claude` (sub OR api key)
                                                                                  │  stream events
        Bar renders run  ◀──IPC push "agent:event"──────────────────────────────┘
```

Reuse is the theme: steps "speak → cleaned transcript" are the **existing dictation pipeline** (`apps/electron/src/renderer/src/lib/{recorder,streamer}.ts` + the `/api/transcribe` route), just terminating in a textarea instead of `window.api.pasteText`.

---

## 3. Architecture

**Three new surfaces, mapped to where they must live:**

| Surface | Process | Why there |
|---------|---------|-----------|
| Agent hotkey listener (#2) | main | Native key listeners already live in main; a second `NativeKeyListener` instance is the established mechanism. |
| Agent Bar window + voice capture + run view | renderer (new focusable window) | Needs focus + a text input (the pill is `focusable:false` and can't host one). Renderer libs (`Recorder`/`Streamer`) are window-agnostic and reusable. |
| Agent Session Engine | main | Spawns the local `claude` CLI; later phases drive the real screen (Part D). Local-machine-bound → cannot live in the now-standalone/Dockerizable server (`StartServerOptions` host/token). |

Engine-in-main also reuses the existing **main→renderer push IPC** convention (`hotkey:down`, `mic:activity-changed`, …) for streaming events, and the subprocess-teardown hygiene already in `cleanupBeforeQuit()` / `will-quit`.

---

## 4. Components

### 4.1 Second agent hotkey (Part B — main process)

The current code assumes a **single** hotkey: one `keyListener` singleton, `currentHotkeyAccel`, and `sendHotkeyDown/Up` broadcasting `hotkey:down/up`. We add a parallel track for the agent.

- **New default accel** (`apps/electron/src/shared/hotkey-defaults.ts`): add `getDefaultAgentHotkey(platform)`, distinct from dictation. Proposal: macOS `Right Command` (modifier-only, native listener supports right-mods) or `Control+Shift+Space`; Windows/Linux a non-conflicting combo. **Decide in review.**
- **New settings keys** (`shared/settings-keys.ts`): `agentHotkey`, `agentHotkeyMode` (mirror existing `hotkey`/`hotkeyMode`).
- **Second listener:** instantiate a second `NativeKeyListener` with the agent accel and callbacks `handleAgentHotkeyDown/Up` → `sendAgentHotkeyDown/Up` → emit `agent-hotkey:down/up` to the **Bar** window only.
  - *Feasibility confirmed:* `NativeKeyListener` is a plain class; multiple instances each spawn their own binary. On macOS both instances receive the full event firehose and filter by their own accel — correct, mildly redundant. (Optimization — one listener fanning out to both — is deferred; note it.)
- **Refactor:** generalize the single `keyListener` global into `dictationKeyListener` + `agentKeyListener`. Critically, the hotkey-recorder flow (`hotkey-record:start`) and `cleanupBeforeQuit()`/`will-quit` currently stop *the* listener — update them to stop/restart **both**.
- **Guard:** ensure the two accelerators can't be bound to the same combo (validation when set).

### 4.2 Agent Bar window (Part C — main + renderer)

- **Window** (`main/index.ts`, new `createAgentBarWindow()` modeled on `createAppWindow`): frameless, bottom-anchored, **`focusable: true`** (the key difference from the pill), `alwaysOnTop` at a normal level, `skipTaskbar`. Shown/focused on `agent-hotkey:down`; not auto-hidden (it's a cockpit). Reuses the `getPillURL`-style loader → new `getAgentBarURL()` → `bar.html`.
- **HTML entry:** add `src/renderer/bar.html` and register it as a **third rollup input** in `electron.vite.config.ts` (`renderer.build.rollupOptions.input.bar`), alongside `index` and `pill`.
- **Renderer page** (`src/renderer/src/pages/bar.tsx` + `bar-main.tsx` mount, mirroring `pages/app.tsx` + the pill mount): hosts the auth/prereq banner, the editable `<textarea>`, Send/Cancel, and the streaming run view.

### 4.3 Voice capture in the bar (Part B — renderer, reuse)

In `bar.tsx`, a slimmed adaptation of the pill's record→transcribe logic:
- Subscribe to `onAgentHotkeyDown` / `onAgentHotkeyUp` (new preload methods).
- On down: `Recorder.acquireStream()` + `Streamer.startCapture()` (same classes as the pill).
- On up: `commit()`, await the `/api/transcribe` result (`{ raw, cleaned }`) — this already runs Freestyle's **post-processing/dictionary cleanup**, which is exactly the "edit-layer advantage" the product spec calls out.
- **Terminate in the textarea, not the clipboard:** set the input value to `cleaned` (append if the user already has text). **Never** auto-send.
- Re-press to re-dictate/append. Send is a separate explicit action.
- *Note:* this runs in the Bar window, independent of the pill's recorder, so the two never share state. Mic contention is unlikely (different hotkeys) but the bar should no-op its capture if a dictation is mid-flight — track via a simple flag.

### 4.4 Agent Session Engine (Part A — main)

`apps/electron/src/main/agent/session-manager.ts`. SDK surface **verified** against the official Agent SDK docs (code.claude.com/docs/en/agent-sdk).

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

class AgentSessionManager {
  async start(input: { prompt: string; cwd: string }): Promise<{ sessionId: string }>;
  cancel(): void;           // controller.abort() — see below
  isRunning(): boolean;
}
```
- `query({ prompt, options })` returns an **async generator** of `SDKMessage` union objects. The shapes we iterate:
  - `type: "system", subtype: "init"` → carries `session_id` (capture it for the `{ sessionId }` return).
  - `type: "assistant"` → `content[]` blocks (`{type:"text", text}` and `{type:"tool_use", name, input, id}`), streamed as they arrive.
  - `type: "result"` → `result` (final text), `usage.{input_tokens, output_tokens}`, `total_cost_usd`, `stop_reason`. Fires once at the end.
  - (also `tool_progress`, `permission_denied` — handle/ignore as needed.)
- **Cancellation (verified):** pass `options.abortController = new AbortController()` and call `controller.abort()` in `cancel()` (the `Query` object also exposes `.interrupt()`).
- **Tool/permission posture (owner decision — full autonomy):** the agent gets **every Claude Code tool** via `tools: { type: "preset", preset: "claude_code" }` and runs them **without any approval** via `permissionMode: "bypassPermissions"` (the SDK requires this be paired with `allowDangerouslySkipPermissions: true`; it also cannot run as root on Unix). This **overrides product-spec D4** (plan-first / never-bypass) for the Phase 0 build at the owner's request — there is no approval gate, so the agent can edit files, run shell commands, fetch the web, etc. ⚠️ Combined with voice input, a misheard prompt executes unattended; Part E's gating becomes a *re-introduction* later rather than a removal.
- `options.cwd` = the configured project path (default `{userData}/agent-scratch`).
- `env` merged with `resolveAuth().env` (§4.5).
- Iterates the generator → **normalizes** each `SDKMessage` to the `AgentEvent` contract (§4.6) → pushes `agent:event` to the Bar. Completion → `result` event w/ usage; throw → `error`.
- Teardown: `controller.abort()` + kill child in `cleanupBeforeQuit()` and a `process.once("exit")` guard (mirrors `whisper/server.ts`).

### 4.5 Auth (Part F — foundations, both paths)

`apps/electron/src/main/agent/auth.ts`:
- **Auth mechanism (verified):** the SDK reads `ANTHROPIC_API_KEY` from the spawned process env → **API-key mode** (metered). If **unset**, it runs its bundled Claude Code binary, which uses the stored CLI login (`~/.claude` credentials) → **subscription mode**. So `resolveAuth()` controls the mode purely by whether it injects the key:
  - `resolveAuth()` → `{ mode: "subscription" | "api-key", env }`. API-key mode injects `ANTHROPIC_API_KEY` from the DB; subscription mode injects nothing.
- **⚠️ Policy conflict to resolve, not a code problem:** the Agent SDK docs (pulled 2026-06-18) still say subscription/CLI login "cannot be used" with the SDK and direct developers to API keys — but that is the **pre-June, now-paused** policy. Anthropic's [June 15 2026 support article](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) explicitly says SDK + third-party-app usage **draws from the user's subscription limits**. The two sources disagree; the support article is newer and authoritative. **Action:** before relying on subscription mode in shipped messaging, re-confirm against the live terms (product-spec R1). The dual-path design means we're covered either way.
- **Prereq nuance (verified):** the SDK **bundles its own Claude Code binary** (optional dependency), so a separate `claude` install is *not* required for the SDK to run. But **subscription mode still needs a logged-in credential store** (`~/.claude`), which the user creates via `claude login` in the real CLI. So: `detectClaudeCli()` becomes "is there a usable login?" rather than "is the binary installed."
- `detectSubscriptionLogin()` — **remaining spike item**: confirm the bundled binary reads the same `~/.claude` credentials a separately-installed CLI login writes, and find a reliable non-interactive "is logged in?" check (inspect creds file, or classify a probe run's auth error). If no clean check exists, fall back to "attempt a run; on auth error, prompt to `claude login` or add an API key."
- **Key storage:** reuse the existing `api_keys` table under a **dedicated `provider = "claude-agent"`** slot (free-form provider string — confirmed in `packages/validations/src/api-keys.ts`), with onboarding offering one-tap copy of an existing `"anthropic"` key (Q5). **Accuracy note:** keys are stored **plaintext** today (no `safeStorage` in repo); encryption-at-rest is a tracked cross-cutting follow-up, not a Phase 0 task.

### 4.6 Event/status contract (shared)

`packages/validations/src/agent.ts` (new, exported from `index.ts`):
```ts
type AgentEvent =
  | { type: "status"; status: "starting"|"running"|"done"|"error"|"canceled" }
  | { type: "assistant_text"; text: string; delta?: boolean }
  | { type: "tool_use"; name: string; input: unknown; id: string }
  | { type: "tool_result"; id: string; result: unknown; isError?: boolean }
  | { type: "result"; usage: { inputTokens: number; outputTokens: number; costUsd?: number }; durationMs: number }
  | { type: "error"; message: string };
```
Field mapping (verified): `result.usage.input_tokens` → `usage.inputTokens`, `result.usage.output_tokens` → `usage.outputTokens`, `result.total_cost_usd` → `usage.costUsd`. The normalization layer in `main/agent` is the **only** place that knows SDK message shapes — the firewall against SDK churn.

### 4.7 IPC + preload surface

| Channel | Kind | Direction | Payload |
|---------|------|-----------|---------|
| `agent-hotkey:down` / `:up` | push | main→bar | — |
| `agent:prereq-status` | invoke | bar→main | → `{ cliInstalled, authMode, subscriptionLoggedIn, apiKeyConfigured }` |
| `agent:set-auth-mode` | send | bar→main | `"subscription" \| "api-key"` |
| `agent:start` | invoke | bar→main | `{ prompt, cwd? }` → `{ sessionId }` |
| `agent:cancel` | send | bar→main | — |
| `agent:event` | push | main→bar | `AgentEvent` |
| `agent-bar:show` / `:hide` | send | bar→main | — |

Add matching `api.agent.*` methods to `preload/index.ts` (+ `index.d.ts`), following the existing `on*`/invoke/send patterns (e.g. `onAgentEvent(cb): () => void` like `onHotkeyDown`).

---

## 5. File change list

**New**
- `apps/electron/src/main/agent/{session-manager,auth,ipc}.ts`
- `apps/electron/src/renderer/bar.html` + `src/renderer/src/bar-main.tsx` + `src/renderer/src/pages/bar.tsx`
- `packages/validations/src/agent.ts` (+ export in `index.ts`)

**Modified**
- `apps/electron/package.json` — add `@anthropic-ai/claude-agent-sdk` (it bundles a native Claude Code binary as an optional dependency, so no separate `claude` install is needed for the SDK to *run*; subscription auth still needs a `claude login` credential store).
- `apps/electron/electron.vite.config.ts` — add `@anthropic-ai/claude-agent-sdk` to `main.build.rollupOptions.external` (config uses `externalizeDeps: false`, so deps are bundled unless listed); add `bar` renderer input.
- `apps/electron/electron-builder.yml` — `asarUnpack: node_modules/@anthropic-ai/claude-agent-sdk/**` (confirmed: the SDK ships a native binary that can't execute inside an asar). On macOS this bundled binary must also be **codesigned + notarized** with the app — see §6.
- `apps/electron/src/main/index.ts` — second `NativeKeyListener`; `createAgentBarWindow()`; `agent-hotkey:*` emit fns; register agent IPC; engine teardown in `cleanupBeforeQuit()`/`will-quit`; generalize the `keyListener` global to two listeners (+ update `hotkey-record:start` to stop both).
- `apps/electron/src/shared/hotkey-defaults.ts` — `getDefaultAgentHotkey`.
- `apps/electron/src/shared/settings-keys.ts` — `agentHotkey`, `agentHotkeyMode`.
- `apps/electron/src/preload/{index.ts,index.d.ts}` — `api.agent.*`.

---

## 6. Spike status

### Resolved (verified against official Agent SDK docs, 2026-06-18)
- **Package/API:** `@anthropic-ai/claude-agent-sdk`, `query({ prompt, options })` → async generator of `SDKMessage`. ✔ (§4.4)
- **Message shapes:** `system/init` (`session_id`), `assistant` (`content[]` text/tool_use), `result` (`usage`, `total_cost_usd`, `stop_reason`). ✔
- **Cancel:** `options.abortController` + `controller.abort()` (or `query.interrupt()`). ✔
- **Permissions:** `permissionMode` incl. `plan`; `canUseTool(toolName, input, opts) → {behavior:"allow"|"deny", …}`. ✔
- **cwd:** `options.cwd`. ✔
- **Auth mechanism:** `ANTHROPIC_API_KEY` present → API key; absent → bundled binary uses `~/.claude` login. ✔
- **Bundling:** SDK ships a native Claude Code binary (optional dep) → needs `asarUnpack`. ✔
- **Sessions (later phase):** JSONL on disk; `listSessions`/`getSessionMessages`/`getSessionInfo`; resume via `options.resume = sessionId`. ✔

### Remaining unknowns (verify during build — these are sharp)
1. **Subscription *policy*** — the SDK docs (pre-June, now paused) say "API key only"; the June 15 support article says subscription usage applies to third-party apps. **Re-confirm against live terms before shipping subscription-mode messaging** (product-spec R1). Mechanism is unaffected; this is a terms question.
2. **Subscription login detection** — does the SDK's *bundled* binary read the same `~/.claude` credentials that `claude login` writes? And the most reliable non-interactive "is logged in?" check. Fallback: run, classify auth error, prompt.
3. **macOS codesigning/notarization of the bundled binary** ⚠️ — a native executable shipped inside the app and `asarUnpack`ed must itself be **codesigned with the app's identity and notarized**, or Gatekeeper blocks it on launch. This is the most likely packaging blocker; validate on a **signed, notarized** build (the existing `build:mac` + `electron-builder.yml` flow), not just `build:unpack`. Check whether entitlements (`build/entitlements.mac.plist`) need the allow-jit / allow-unsigned-executable-memory flags the binary may require.
4. **Second macOS listener coexistence** — confirm two `macos-key-listener` processes run cleanly side by side; note the single-listener fan-out optimization for later.
5. **SDK version pin** — pin the version and watch the changelog; the message/options surface is young and may churn.

---

## 7. Verification / acceptance

On a **packaged** build:
- **Subscription path:** with the `claude` CLI logged into a subscription and no API key — press the agent hotkey, speak "list the files in this folder", see the cleaned transcript appear in the bar input, edit it, send, and watch the agent stream a response with a final usage line.
- **API-key path:** same flow with no subscription login but a configured `claude-agent` key.
- **Edit-before-send works:** transcript is editable and never auto-sends; re-dictation appends.
- `agent:cancel` aborts an in-flight run; quitting mid-run leaves **no orphan** `claude` process.
- **No regressions:** the dictation hotkey + pill behave exactly as before; the agent hotkey and bar are independent.

---

## 8. Risks specific to this slice

- **Surface area:** four parts at once. Mitigate by building in the §2 order and smoke-testing each seam (hotkey→IPC, IPC→record, record→transcribe, transcribe→input, input→engine, engine→stream) before integrating.
- **Single-hotkey assumptions:** the codebase assumes one listener; the recorder/quit paths touch it. The refactor to two listeners is the riskiest main-process change — cover it in the acceptance run (dictation must be unaffected).
- **Safety during a real run:** the slice runs a real agent. The conservative permission posture (§4.4) is **not optional** — land it with the first run, not later.
- **Policy (R1):** subscription billing is in flux; proving both auth paths now means neither is a single point of failure.
- **Packaging:** subprocess-spawning Node deps routinely break only in the asar/packaged build — test packaged early.
