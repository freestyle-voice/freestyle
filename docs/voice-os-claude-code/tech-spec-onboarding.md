# Tech Spec — Agent-First Onboarding & "Connect Claude Code"

**Status:** Draft for implementation · **Owner:** Matthew Wang · **Date:** 2026-06-19
**Companion docs:** [`ui-ux-improvements.md`](./ui-ux-improvements.md) (§3, §6 — this is build #1) ·
[`product-spec.md`](./product-spec.md) (Part F) · [`tech-spec-phase-0.md`](./tech-spec-phase-0.md)

> **What this builds:** the first piece of the UI/UX redesign — a re-centered,
> **agent-first onboarding** that ends with the user's first successful Claude
> Code run, and a self-healing **Connect Claude Code** step that gets them
> authenticated (subscription or API key) with live status checks. Pure
> experience-layer work on top of agent plumbing that already exists.

---

## 1. Scope

### In scope
- Restructure `onboarding.tsx` from today's 3-step dictation flow into a
  compacted **4-step agent-first flow** (§4): Speak · Connect · First task · Done.
- A **Connect Claude Code** step: detect auth readiness, guide subscription
  sign-in (`claude login`) **or** API-key entry, with live re-checks.
- A **sandboxed first agent run** rendered inside the onboarding window, with the
  agent hotkey taught inline (no separate rebind step — rebinding stays in Settings).
- A **"You're set"** cheat-sheet closing step.
- The small main-process + IPC + validations additions these require.

### Out of scope (later builds, per §6)
- The Sessions dashboard home, sidebar IA, the Agent Bar rework, unified
  pill/bar visuals, TTS/JARVIS. Onboarding still lands on `/today` for now
  (swap to **Sessions** when build #3 lands — single-line change in `finishSetup`).
- Permission gating / plan-mode (Part E). The Phase-0 engine runs
  `bypassPermissions`; we contain risk in onboarding by sandboxing the first run
  (§6.4), not by adding gating here.

---

## 2. Goals & non-goals

**Goals**
- A brand-new user finishes onboarding having (a) dictated once, (b) connected
  Claude Code, and (c) watched the agent complete one real task — all without
  reading docs.
- Never dead-end: if auth isn't ready, the step makes it trivial to fix and
  re-checks live; if the user bails, dictation still works and a persistent
  "finish connecting" affordance remains.
- Reuse existing seams (agent IPC, `api_keys` storage, hotkey recorder, the
  `capture()` analytics funnel, i18n) — minimal new surface area.

**Non-goals**
- Re-implementing the agent run engine, the bar, or computer use (all exist).
- Encrypting API keys at rest (tracked cross-cutting follow-up; unchanged here).

---

## 3. Key technical reality that shapes the design

The Agent SDK call in `session-manager.ts:178` runs `query({ … })` with **no
`pathToClaudeCodeExecutable`** → it uses the SDK's **bundled** Claude Code CLI.
Consequences:

1. **Running agents needs no separate `claude` install.** The bundle handles it.
2. **The real prerequisite is *auth*,** resolved today by `auth.ts`:
   - **Subscription** — `~/.claude.json` has an `oauthAccount`
     (`hasSubscriptionLogin()`). Writing that record requires the **standalone
     `claude` CLI** to run its OAuth `login` flow once. The SDK does not expose a
     login API.
   - **API key** — a key stored in the `claude-agent` provider slot
     (`AGENT_KEY_PROVIDER`), injected as `ANTHROPIC_API_KEY`. **No CLI at all.**
3. `agent.prereqStatus()` already returns exactly what we need to drive the UI:
   `{ authMode, apiKeyConfigured, subscriptionLoggedIn, authReady }`.

**Therefore the Connect step is auth-first, not install-first.** "Install the
CLI" is only a sub-requirement of the *subscription sign-in* path (you need a
`claude` binary to log in); the *API-key* path is a complete, CLI-free escape
hatch. This corrects the brainstorm doc's framing in §3.3.

---

## 4. The flow (target) — 4 steps

Onboarding drop-off compounds per screen, so the flow is compacted to **four
steps**, built around the two beats that can't be cut (Connect + first run):

```
 1. Speak            identity line + mic + accessibility, then try dictation
                     in one motion — "the voice layer over your computer"
 2. Connect Claude   self-healing auth: subscription sign-in OR API key   ← core
 3. Your first task  agent hotkey shown inline + sandboxed read-only run,
                     streamed live in-window  🎉                          ← core
 4. You're set       cheat-sheet: two hotkeys, where the bar lives → /today
```

**Three compaction moves** (vs. the brainstorm's 7-step sketch):

1. **Merge welcome + mic + dictation into one "Speak" step.** Stating the
   identity, granting the mic, and proving it with a live transcription are one
   motion. Accessibility is requested here too — the dictation hotkey listener
   already needs it, so it's not agent-specific.
2. **Defer Screen Recording to just-in-time.** It's only needed for *computer
   use*, which is off by default (`agentComputerUse`) and not exercised by the
   first run. Asking for it the first time computer use is triggered removes the
   most intimidating prompt from the activation path. (The
   `agent:computer-use:request-screen-recording` handler already exists for that
   moment.)
3. **Teach the agent hotkey in context, not in a dedicated step.** Ship a good
   default, *show* it inline during the first run ("hold ⌥Space and speak — or
   hit Run"), and keep rebinding in Settings. Learned by doing, in the one place
   it's used.

Step 1 reuses today's `permissions` + `tutorial` UI almost verbatim; steps 2–4
are new. Language selection (today's middle step) folds into a quiet control on
step 1 or moves to Settings — it no longer earns a full screen (Open Q3).

---

## 5. Architecture changes

All additions follow existing conventions: main-process logic under
`src/main/agent/`, control over the `agent:*` IPC namespace, the renderer bridge
under `window.api.agent.*`, shared types in `@freestyle/validations`.

### 5.1 Main process — new: CLI detection + login runner

**New file `apps/electron/src/main/agent/cli.ts`:**

```ts
export interface AgentCliStatus {
  installed: boolean;          // standalone `claude` resolvable (login-capable)
  version: string | null;      // parsed from `claude --version`
  path: string | null;         // resolved binary path
}

/** Resolve a standalone `claude` for the OAuth login flow. */
export function detectClaudeCli(): Promise<AgentCliStatus>;

/**
 * Run `claude login`. Spawns the standalone CLI (opens the browser OAuth flow),
 * streams its stdout/stderr to the renderer, resolves on exit. The renderer
 * then re-polls agent:prereq-status until subscriptionLoggedIn flips true.
 */
export function runClaudeLogin(
  onOutput: (chunk: string) => void,
): Promise<{ ok: boolean; code: number | null }>;
```

**macOS PATH gotcha (must handle):** GUI-launched Electron apps don't inherit
the user's login-shell `PATH`, so an npm/Homebrew-installed `claude` is often
invisible to a naive `spawn("claude")`. `detectClaudeCli` must resolve through a
login shell (e.g. `execFile(process.env.SHELL ?? "/bin/zsh", ["-lic", "command -v claude && claude --version"])`)
and also probe common install dirs (`/opt/homebrew/bin`, `/usr/local/bin`,
`~/.npm-global/bin`, npm prefix). `runClaudeLogin` spawns via the same resolved path.

**No change to `auth.ts`'s `getPrereqStatus`** — it already gives us
`authReady`. CLI status is a *separate, async* concern (shell-out), so it gets
its own IPC rather than bloating the sync prereq snapshot.

### 5.2 IPC additions (`apps/electron/src/main/agent/ipc.ts`)

| Channel | Kind | Returns / payload | Purpose |
|---|---|---|---|
| `agent:cli-status` | `handle` | `AgentCliStatus` | Is a login-capable `claude` present? |
| `agent:login-start` | `handle` | `{ ok, code }` | Run `claude login`; streams output (below) |
| `agent:login-output` | `send`→renderer | `string` | Live stdout/stderr lines during login |
| `agent:open-terminal-login` | `on` | — | Fallback: open Terminal/iTerm with `claude login` |

Existing, reused unchanged: `agent:prereq-status`, `agent:set-auth-mode`,
`agent:start`, `agent:event`, `agent:cancel`, plus the macOS computer-use
permission handlers (`agent:computer-use:status` /
`…:request-screen-recording`) for step 3's screen-recording reframe.

**Agent API key storage** reuses the existing server route — the renderer POSTs
to `client.api.keys.$post({ provider: "claude-agent", key })` (the same
`api_keys` table `auth.ts` reads via `FREESTYLE_DB_PATH`). No new key plumbing.

### 5.3 Preload additions (`preload/index.ts` + `index.d.ts`)

Extend the `agent` bridge object:

```ts
agent: {
  // …existing…
  cliStatus: (): Promise<AgentCliStatus> =>
    ipcRenderer.invoke("agent:cli-status"),
  loginStart: (): Promise<{ ok: boolean; code: number | null }> =>
    ipcRenderer.invoke("agent:login-start"),
  onLoginOutput: (cb: (chunk: string) => void) => { /* on/removeListener */ },
  openTerminalLogin: (): void =>
    ipcRenderer.send("agent:open-terminal-login"),
}
```

### 5.4 Validations (`packages/validations/src/agent.ts`)

Add the `AgentCliStatus` interface (above). Everything else
(`AgentPrereqStatus`, `AgentAuthMode`, `AgentEvent`, …) is already defined.

### 5.5 Renderer — onboarding restructure

`onboarding.tsx` keeps its single-file, per-step-component shape. The `Step`
union collapses to four:

```ts
type Step =
  | "speak"     // 1 — identity + mic + accessibility + try dictation
  | "connect"   // 2 — Connect Claude Code
  | "firstRun"  // 3 — agent hotkey inline + sandboxed run
  | "done";     // 4 — cheat-sheet
```

Step components (mirroring existing `PermissionsStep`/`TutorialStep` patterns,
reusing `PermCard`, `Button variant="ink"`, the hotkey recorder hook, i18n keys):

- **`SpeakStep`** — folds today's `PermissionsStep` (mic + macOS accessibility
  via the existing `checkAccessibilityPermission` / `openAccessibilitySettings`)
  and `TutorialStep` (the live `TutorialDemo` dictation try) into one screen,
  topped with the product identity line. Language can ride along as a quiet
  control. **No Screen Recording here** — deferred (§4 move 2). Continue is gated
  on mic (+ accessibility on macOS), exactly as `PermissionsStep` is today.
- **`ConnectClaudeStep`** — the centerpiece (§6.1–6.3).
- **`FirstRunStep`** — shows the **default agent hotkey inline** and runs the
  sandboxed task (§6.4). No separate hotkey-rebind screen; rebinding lives in
  Settings.
- **`DoneStep`** — cheat-sheet card; `onFinish` → `setOnboardingComplete()` →
  `/today`.

`finishSetup()` (currently `onboarding.tsx:578`) is unchanged except it's
reached from `DoneStep`.

**Screen Recording (deferred, not dropped):** the just-in-time ask happens at the
first computer-use trigger, reusing
`agent:computer-use:request-screen-recording` + `agent:computer-use:status`. The
Settings → Computer Use section remains its permanent home. No onboarding screen.

---

## 6. Detailed behavior

### 6.1 Connect Claude Code — state model

On mount and on every re-check, call `agent.prereqStatus()` and (lazily, only on
the subscription path) `agent.cliStatus()`. Derived UI state:

```
authReady === true                        → ✓ "Connected"  (green, Continue enabled)
authReady === false, mode = subscription  → guide sign-in (6.2)
authReady === false, mode = api-key       → guide key entry (6.3)
```

The step shows a segmented **auth path** control (subscription | API key),
defaulting to **subscription** (D1), persisting via `agent.setAuthMode(mode)`.
Switching paths re-evaluates readiness for that path.

### 6.2 Subscription sign-in path

```
 ◉ Use my Claude subscription   (Pro/Max/Team — recommended)

   sub-state A — already logged in (subscriptionLoggedIn):
     ✓ Signed in to Claude            [ Continue → ]

   sub-state B — not logged in, CLI present (cliStatus.installed):
     ⚠ Not signed in
       [ Sign in to Claude ]   → agent.loginStart()
         · streams output lines (onLoginOutput) in a small mono log
         · opens the browser OAuth flow (the CLI does this)
         · on resolve, re-poll prereqStatus until subscriptionLoggedIn

   sub-state C — not logged in, CLI absent (!cliStatus.installed):
     ○ Claude Code CLI not found (needed only to sign in)
       npm install -g @anthropic-ai/claude-code        [copy]
       [ I've installed it — re-check ]   → cliStatus() again
       …or [ Use an API key instead ]  (jump to 6.3, no CLI required)
```

`loginStart` failure (non-zero exit, user closed the browser) → inline error +
"Try again" + the Terminal fallback button (`openTerminalLogin`) for users whose
shell environment the spawn can't reproduce.

### 6.3 API-key path

```
 ○ Use an Anthropic API key   (metered, predictable billing)
   [ sk-ant-…                              ] 👁   [ Save ]
   get a key → console.anthropic.com/settings/keys
```

Reuse the onboarding key-entry pattern already in
`ModelSelectorOverlay`/`saveCloudKey` (validation via `apiKeySchema`, reveal
toggle), but POST with `provider: "claude-agent"`. On save → set auth mode to
`api-key` → re-poll prereqStatus → `apiKeyConfigured` true → `authReady` true.

### 6.4 First agent run (sandboxed)

Because the Phase-0 engine runs `bypassPermissions` (full autonomy), the
onboarding run must be **contained**, not trusted to a freeform prompt:

- **Scratch cwd:** main process creates/uses
  `app.getPath("userData")/onboarding-scratch/` seeded with 2–3 tiny sample
  files (a `README.md`, a `notes.txt`). Pass it as `cwd` to `agent.start`.
- **Canned, read-only prompt:** e.g. *"List the files in this folder and give me
  a one-sentence summary of what's here. Don't modify anything."*
- **Teach the hotkey inline (no separate step):** the step shows the default
  agent hotkey ("hold ⌥Space and speak your task") as the primary, in-context
  path, with a secondary **Run** button that fires the canned prompt directly.
  Speaking is the authentic aha; the button guarantees success even if STT
  fumbles the canned phrase, so activation never hinges on recognition quality.
- **Render in-window:** `FirstRunStep` mints a `runId`, calls
  `agent.start({ prompt, runId, cwd: scratchDir })`, subscribes to
  `agent.onEvent`, and renders a minimal transcript (assistant text + a compact
  tool-call list + the final `result` usage/cost). This deliberately **does not
  depend on the Agent Bar** (its rework is build #2) — it's a self-contained
  viewer, so build #1 ships independently.
- **Outcomes:** on `status: done` → success state + Continue. On `error`
  (e.g. auth) → friendly message routing back to the Connect step. Provide
  "Skip for now" so a flaky network never traps the user.

This is the moment the pivot lands; ending onboarding here is the single
highest-leverage change (brainstorm §3.4).

---

## 7. Data & settings touched

| Store | Key | Read/Write |
|---|---|---|
| Electron `settings.json` | `agentAuthMode` (`subscription`\|`api-key`) | written via `agent:set-auth-mode` |
| Electron `settings.json` | `onboardingComplete` | written on finish (existing) |
| Electron `settings.json` | agent hotkey accelerator | written by the hotkey recorder (Open Q1) |
| Server `api_keys` table | provider `claude-agent` | written via `client.api.keys.$post` |
| `~/.claude.json` | `oauthAccount` | written by `claude login` (out of our process) |

No schema changes. No new DB tables.

## 8. Edge cases & failure handling

- **`claude` not on PATH (macOS GUI launch):** handled by login-shell resolution
  in `detectClaudeCli` (§5.1); if still unresolved, fall to sub-state C +
  Terminal fallback.
- **Login spawn can't open a browser / headless:** surface streamed output +
  `openTerminalLogin` fallback.
- **User abandons Connect:** allow Continue-as-skip; `DoneStep` and (future)
  Sessions show a persistent "Finish connecting Claude Code" banner. Dictation is
  never blocked.
- **First-run auth error despite green Connect:** `friendlyError` already
  humanizes 401/oauth; route the user back to step 4.
- **Stale prereq cache:** always re-poll on step focus and after any login/key
  mutation; never trust a snapshot across an async action.
- **Re-onboarding / already connected:** every step is idempotent — green checks
  short-circuit to Continue.

## 9. Analytics

Extend the existing `capture()` funnel (consistent with
`onboarding_step_viewed`, `onboarding_*_granted`):
`onboarding_connect_viewed`, `onboarding_auth_path_selected {path}`,
`onboarding_login_started`, `onboarding_login_succeeded` /
`onboarding_login_failed {reason}`, `onboarding_agent_key_saved`,
`onboarding_first_run_started`, `onboarding_first_run_succeeded {durationMs,costUsd}` /
`onboarding_first_run_failed {reason}`, `onboarding_first_run_skipped`.
These give us the new drop-off funnel for the pivot's activation metric.

## 10. Testing

- **Unit (main):** `detectClaudeCli` PATH-resolution across present/absent/odd-PATH;
  version parsing; `runClaudeLogin` success/failure/abort.
- **Integration:** prereqStatus → UI state mapping for all three Connect
  sub-states; key save flips `authReady`.
- **E2E (existing harness, `window.api.isE2E`):** drive the full flow with a
  stubbed agent run (gate real spawns behind `isE2E`, as the model
  auto-download already does at `onboarding.tsx:478`). Assert it lands on
  `/today` with `onboardingComplete` set.
- **Manual matrix:** macOS (logged-in CC user — should auto-green), macOS (fresh,
  no CLI → install → login), API-key-only user, offline first-run.

## 11. Implementation sequence

1. **Validations + main + IPC + preload** — `AgentCliStatus`, `cli.ts`
   (`detectClaudeCli`, `runClaudeLogin`), the four new IPC channels, the preload
   bridge methods. Backend-complete and testable before any UI.
2. **`ConnectClaudeStep`** — the highest-risk, highest-value UI; build against
   the new IPC. Both auth paths + live re-check.
3. **Onboarding restructure** — collapse to the 4-step `Step` union, build
   `SpeakStep` (merge mic + accessibility + dictation try + identity line, fold
   language), wire ordering/back-nav.
4. **`FirstRunStep`** — scratch dir + canned prompt + inline hotkey/Run +
   in-window event viewer.
5. **`DoneStep`** + cheat sheet; analytics; i18n keys; E2E.

Steps 1–2 are the critical path; 3–5 layer the surrounding flow.

## 12. Open questions / to confirm during implementation

1. **Agent hotkey persistence** — confirm the settings key + default for the
   second (agent) hotkey. Main already emits `agent-hotkey:down/up` and the
   preload exposes `agent.onHotkeyDown/Up`, so a registration path exists; locate
   its default (sibling to `getDefaultHotkey()` in `shared/hotkey-defaults.ts`)
   and reuse `useHotkeyRecorder` bound to it.
2. **`claude login` UX depth** — spawn-and-stream in-window (spec'd default) vs.
   only deep-linking to Terminal. Spec'd default is spawn-and-stream with the
   Terminal path as fallback; confirm the bundled vs standalone CLI can both
   reach the same `~/.claude.json` (they should — same credential file).
3. **Language step fate** — fold into welcome as a quiet control, keep as a
   slim step, or move entirely to Settings? (Affects step count/ordering.)
4. **Landing target** — keep `/today` until Sessions ships (spec'd), or build a
   minimal agent-aware "Today" now?
5. **Scratch-dir prompt** — exact canned task + whether to localize it.
