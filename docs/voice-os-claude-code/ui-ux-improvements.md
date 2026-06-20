# Freestyle Voice OS — Onboarding & UI/UX Redesign

**Status:** Brainstorm → concrete proposal · **Owner:** Matthew Wang · **Date:** 2026-06-19
**Companion docs:** [`overview.md`](./overview.md) · [`product-spec.md`](./product-spec.md) · [`phase-0-improvements.md`](./phase-0-improvements.md)

> We've pivoted Freestyle from a best-in-class voice **dictation** app into a
> **Voice OS for Claude Code**. The plumbing already works end-to-end. What's
> missing is the *experience*: onboarding still acts like we ship a dictation
> utility, and the agent UI is bolted on beside it instead of being the spine of
> the product. This doc proposes how to fix both.

### Locked decisions (from review)

| # | Decision |
|---|----------|
| **P1** | **Agent-first, dictation preserved.** The Claude Code voice agent is the hero of onboarding and the app's identity. Dictation stays first-class and unchanged — but it's no longer the headline. |
| **P2** | **Full guided Claude Code setup.** Onboarding detects whether the `claude` CLI is installed and authenticated, and walks the user through install → `claude login` → choosing an auth path, with live status checks. |
| **P3** | **Bold restructure.** We rethink the window model and dashboard IA from scratch — unify the floating surfaces, build a Claude-Code-desktop-style sessions home, reorganize settings around the agent. |
| **P4** | **This doc = brainstorm + concrete proposal.** Ideas and tradeoffs, then a recommended onboarding flow and UI/UX redesign at wireframe fidelity. |

---

## 1. Where we are today (the honest audit)

**What already works** (shipped in `f8c15a8`, `e5c5788`):
- Voice → editable query → Claude Agent SDK → streaming results, with the agent
  running the local `claude` CLI (subscription or BYOK key).
- A computer-use actuator (screenshot / click / type) with a guided-mode overlay
  that ghost-points before acting.
- An always-on **Agent Bar** (`apps/electron/src/renderer/src/pages/bar.tsx`) that
  collapses to a 268×84 strip at top-center and expands on hover.

**Where the experience breaks down:**

1. **Onboarding is dictation-only.** `onboarding.tsx` covers mic + accessibility
   permissions, language, and a Whisper/MLX model + hotkey. It never mentions
   Claude Code, the agent hotkey, auth, computer use, or what the product is
   *for* now. A new user finishes setup with zero idea the agent exists.

2. **Four windows, four mental models.** Dictation **pill** (bottom), agent
   **bar** (top), settings **dashboard**, computer-use **overlay**. They don't
   share a spatial language, so the agent feels like a different app stapled on.

3. **The dashboard is a dictation control panel.** Sidebar = Today, History,
   Dictionary, Vocabulary, Formats, Models. There is **no home for agent
   sessions** — the thing the product is now about. Agent config is a buried
   "Computer Use" sub-section of Settings.

4. **Known agent-bar bugs** (from `phase-0-improvements.md`): sent message
   doesn't appear in the thread, input doesn't clear on send, every turn starts a
   new conversation (no resume), bar placement is top vs the pill's bottom.

The foundation is strong. The product just hasn't been *re-centered* around the
agent yet. Everything below does that.

---

## 2. The reframe: one product, two reaches, one spatial language

The mental model we want the user to internalize on day one:

> **Freestyle is the voice layer over your computer. Hold one key to *type* with
> your voice. Hold another to *act* with your voice — that's Claude Code, hands-free.**

Two "reaches" of the same voice layer:

| | **Dictation** (Globe/Fn) | **Agent** (second hotkey) |
|---|---|---|
| Output | Text into the focused field | Actions, code, answers from Claude Code |
| Surface | The pill | The bar |
| Latency feel | Instant | "Working…" with streaming |
| Trust model | Zero risk | Plan-first / confirm to act |

The redesign's job is to make these feel like **two gears of one machine**, not
two apps. The unifying device is a **shared spatial + visual language** (§4).

---

## 3. Onboarding redesign (P1 + P2)

### 3.1 Principles

- **Teach by doing, not by reading.** Every capability is proven with a live
  "try it now" moment inside onboarding.
- **Progressive permission.** Ask for each OS permission *at the moment its value
  is obvious*, not in an upfront wall.
- **The agent is the headline.** Dictation is set up as the warm-up; the agent is
  the destination.
- **Never dead-end on Claude Code setup.** If the CLI is missing or logged out,
  the flow makes it trivial to fix and re-checks live.

### 3.2 The flow

```
 0. Welcome ………… "Freestyle is the voice layer over your computer."
                     One sentence + a 6-second loop showing pill→bar.
 1. Microphone …… request at the moment we show the first live waveform.
 2. Your voice, ↦ text ……  TRY IT: hold Globe, say a sentence, watch it
                     transcribe into a sandbox field. (Dictation proven.)
 3. Hands for the agent …… Accessibility + (later) Screen Recording, framed
                     as "so Claude can see and act on your screen."
 4. Connect Claude Code ……  THE NEW CRITICAL STEP (see 3.3)
 5. Pick your agent hotkey ……  record it; explain hold-to-talk-then-edit.
 6. TRY IT: your first agent run ……  a safe, read-only canned task in a
                     scratch dir ("summarize the files in this folder").
                     User speaks, edits, sends, watches it stream. 🎉
 7. You're set ……… cheat-sheet card: two hotkeys, where the bar lives,
                     how to confirm actions. Lands on the Sessions home.
```

Steps 1–2 reuse today's dictation onboarding almost verbatim — it's good. Steps
3–6 are net new and carry the pivot.

### 3.3 Step 4 — "Connect Claude Code" (the heart of P2)

This is a self-healing checklist with live status, not a form:

```
 Connect Claude Code
 Freestyle runs Claude Code under the hood — using YOUR Claude
 subscription or API key. No second subscription.

   ✓  Claude Code CLI installed              v1.x detected
   ⚠  Logged in                              not authenticated
        └ [ Run `claude login` for me ]  ·  guided in-app terminal
   ○  Choose how Freestyle bills agent runs
        ◉ Use my Claude subscription  (Pro/Max/Team — recommended)
        ○ Use an Anthropic API key    (metered, predictable billing)

   [ Re-check ]                       [ Continue → ]  (enabled when ✓✓)
```

Behaviors:
- **CLI detection** — shell out to `claude --version`; if absent, show the exact
  install command per-OS with a copy button (and a "Run for me" where safe).
- **Login** — detect logged-out state; offer to launch `claude login` in a
  guided in-app terminal pane, then auto re-check. This reuses the same status
  primitives the Computer Use settings section already has.
- **Auth path** — surfaces decision **D1** from the product spec (subscription
  primary, BYOK fallback). Writes `agentAuthMode`. Explain in one line that
  subscription draws from their Claude limits; API key is metered.
- **Never blocks dictation.** If the user bails here, dictation still works and
  the Sessions home shows a persistent "Finish connecting Claude Code" banner.

### 3.4 Why "try it now" twice

Two aha-moments, deliberately staged: *"my voice became text"* (step 2, zero
risk, instant) builds trust in the mic; *"my voice made Claude do something"*
(step 6, read-only, sandboxed) is the moment the pivot lands. Ending onboarding
on a successful agent run is the single highest-leverage change we can make.

---

## 4. The bold restructure (P3)

### 4.1 Window model: from 4 strangers to 1 family

Keep four windows (the focus/click-through constraints in **D5** are real — the
pill must never steal focus, the bar must), but make them **one visual system**
that lives on a shared vertical axis.

```
        ┌──────────────────────────────────────────┐
  TOP   │  ▁▁▁  Agent Bar (collapsed strip)         │  ← actions / Claude
        └──────────────────────────────────────────┘
                          … screen …
                 ┌────────────────────────┐
  OVERLAY        │  guidance ghost-cursor  │            ← only during computer-use
                 └────────────────────────┘
        ┌──────────────────────────────────────────┐
  BTM   │            ◉  Dictation Pill              │  ← text
        └──────────────────────────────────────────┘
```

Shared language across all four surfaces:
- **One orb, one waveform, one motion vocabulary.** The `orb.tsx` +
  `voice-pill.tsx` components already render in both pill and bar — make them the
  literal same component with a `mode` prop (`dictate | agent`), differentiated
  only by accent color (calm blue for dictation, an "active" warmer hue for the
  agent). Today they drift; unify them.
- **Mirrored placement.** Dictation lives bottom, agent lives top — a deliberate
  "type below, act above" spatial metaphor the user learns once.
- **Same material:** identical blur, corner radius, shadow, type scale (DM Sans),
  spacing. shadcn tokens already exist; enforce them everywhere.

### 4.2 The Agent Bar — the spine of the product

Three states, one window:

```
COLLAPSED (default, click-through):
  ┌───────────────────────────────┐
  │  ◔  Claude · idle              │      thin, ~84px, barely there
  └───────────────────────────────┘
        │ a run is active? show a live pulse + 1-line status:
  ┌───────────────────────────────┐
  │  ◉  editing login flow… · 3 tools · $0.12   ▝▘ │
  └───────────────────────────────┘

PEEK (on hover — no focus steal):
  ┌───────────────────────────────────────────────┐
  │  ◉  Claude                         ⌥Space to talk│
  │  ───────────────────────────────────────────────│
  │  ▸ summarize the spec        running   2:14  $0.08│
  │  ▸ rename the components      done      —    $0.03│
  │  + new conversation                              │
  └───────────────────────────────────────────────┘

EXPANDED (on click/focus — full thread, like CC desktop):
  ┌──────────────┬────────────────────────────────────┐
  │ CONVERSATIONS│  editing login flow      ⋯  ◼ stop  │
  │ ▸ login flow │  ────────────────────────────────── │
  │   spec → plan│  you: add a remember-me checkbox     │
  │   rename …   │  claude: I'll update LoginForm…      │
  │   + new      │   ⌗ Edit  LoginForm.tsx  +12 −3      │
  │              │   ⌗ Bash  pnpm test      ✓ pass      │
  │ ──────────── │  ────────────────────────────────── │
  │ proj: web ▾  │  ▸ [ hold ⌥Space and speak…    ] ⏎  │
  └──────────────┴────────────────────────────────────┘
```

This directly resolves the `phase-0-improvements.md` asks:
- **Sent message appears immediately** — optimistically append the user turn
  before the stream returns.
- **Input clears on send**, refocuses for the next turn.
- **Resume conversations** — the left rail is the conversation list (read from
  Claude Code's on-disk transcripts per **Part G**); clicking one continues it
  instead of always starting fresh. "+ new" is the only thing that starts fresh.
- **Minimalist + non-invasive** — collapsed by default, click-through, auto-min
  on mouse-out (the 300ms timer already exists), work continues in the
  background with only a quiet pulse to signal activity.
- **Project scope** is a first-class selector in the rail (**D7** — runs are
  cwd-scoped), defaulting to last-used / frontmost-app inference.

### 4.3 Dashboard IA: from dictation panel to Voice OS console

Re-center the sidebar around the agent. Two groups:

```
  FREESTYLE
  ┌────────────────────┐
  │  ◉  Sessions      1 │  ← NEW. agent home. live + past runs, resume,
  │  ⚡ Quick Tasks     │     cost. the new landing page after onboarding.
  │                    │
  │  DICTATION         │
  │  ▸ History         │  ← existing pages, grouped + de-emphasized
  │  ▸ Dictionary      │
  │  ▸ Vocabulary      │
  │  ▸ Formats         │
  │                    │
  │  ⚙  Models         │  ← shared (voice + agent models)
  │  ⚙  Settings       │
  └────────────────────┘
```

- **Sessions** becomes the home route (replacing `today.tsx` as the post-
  onboarding landing). It's the in-dashboard twin of the expanded bar: full-width
  conversation browser, searchable, grouped by project, showing status + cost +
  last activity. Reads CC transcripts (no new DB — **Part G** non-goal honored).
- **Quick Tasks** (optional, later): a launcher of saved voice macros ("run the
  tests and tell me what failed").
- **Settings** absorbs a proper **Agent** section: auth path + live Claude Code
  status (mirrors onboarding step 4), computer-use toggle + guided/full mode,
  default project, permission posture (**Part E** plan-first vs autonomous), and
  spend/usage visibility (**D2**).

### 4.4 Cost & trust, made visible (D2 + E)

Two things must be glanceable everywhere the agent appears:
- **Cost/usage** — a tiny running `$0.12` / subscription-meter on every run row
  (collapsed strip, peek list, expanded header). Heavy agent runs can burn
  Claude limits fast; the user should never be surprised.
- **Confirmation surface** — when the agent wants to do something mutating, the
  bar raises an inline confirm card ("Claude wants to run `rm -rf build/` —
  [Allow] [Skip]"), confirmable by **voice** ("go" / "skip") or click. This is
  where **Part E** lives in the UI. Even though Phase 0 ships
  `bypassPermissions`, the *surface* should exist so re-introducing gating is a
  policy flip, not a redesign.

---

## 5. Creative bets (pick the ones worth prototyping)

- **JARVIS mode (read-aloud + barge-in).** The bar reads plans/answers aloud
  (TTS) and lets you interrupt by speaking. This is the differentiator a
  keyboard-bound CC can't touch (**Part H**). Even a minimal "read the plan
  aloud" toggle sells the vision.
- **One unified hotkey with intent detection.** Instead of two keys, hold one and
  let a fast classifier route "fix the failing test" → agent vs "dear team," →
  dictation. Risky (lossy), but the dream is *zero* cognitive overhead. Offer as
  an opt-in; keep two keys as the default.
- **"Narrate-first" guided help as a named mode.** The Vercel-dashboard use case
  (overview) is magic. A first-class "Guide me" affordance that *points and
  explains before clicking* is both safer and more demo-able than silent
  automation.
- **Voice-editable diffs.** When Claude proposes an edit in the bar, "no, keep
  the old import" tweaks it before applying — voice as the review loop.
- **Ambient status, not a window.** When collapsed and a run is active, the strip
  could shrink to a single breathing dot near the menu bar — Freestyle as a
  presence, not an app you "open."
- **Session handoff to the terminal.** "Open this in my terminal" hands the
  running CC session to a real `claude` TUI for power users — Freestyle as the
  voice front door to the same session, not a walled garden.

---

## 6. Concrete proposal (what I'd build)

**Onboarding** — replace `onboarding.tsx`'s linear dictation flow with the 7-step
flow in §3.2, leading with the product sentence, proving dictation (step 2), then
the self-healing **Connect Claude Code** checklist (§3.3) and a sandboxed first
agent run (step 6). Land on **Sessions**.

**Window system** — unify pill + bar on one orb/waveform component with a `mode`
prop and a shared material spec (§4.1). Pill stays bottom, bar stays top.

**Agent Bar** — implement the collapsed → peek → expanded states (§4.2), fix the
three `phase-0-improvements.md` bugs, add the conversation rail with resume and a
project selector.

**Dashboard** — add **Sessions** as the home route, regroup the sidebar into
Agent vs Dictation (§4.3), and give Settings a real **Agent** section with live
Claude Code status, auth path, computer-use mode, permissions, and cost.

**Trust** — cost on every run row; an inline voice-confirmable confirmation card
ready for when Part E gating turns on (§4.4).

Suggested sequencing (maps to the product spec's phases):
1. **Onboarding + Connect-Claude-Code** (unblocks every new user; pure UX, low risk).
2. **Agent Bar rework** (fix bugs, resume, states, unified visuals) — the daily-driver surface.
3. **Sessions home + Settings/Agent section** (the dashboard re-center).
4. **Trust + creative bets** (confirmation surface, then TTS/JARVIS as a wedge).

---

## 7. Open questions

1. **Hotkey defaults** — what's the second (agent) hotkey out of the box, and do
   we ever ship the single-key intent-routing experiment?
2. **Sessions vs Today** — fully replace `today.tsx`, or keep a lightweight Today
   that rolls up both dictation stats and recent agent runs?
3. **Project/cwd model** — explicit picker, frontmost-app inference, or both? (Blocks the bar's project selector and Sessions grouping.)
4. **How aggressive is "Run `claude login` for me"** — embed a real terminal pane,
   or just deep-link + instructions? (Affects step-4 build cost.)
5. **TTS provider** — local vs cloud for read-aloud, given the local-first ethos.
6. **Confirmation default** — voice-confirm, click-confirm, or per-tool memory,
   once Part E gating lands (**D4**, currently overridden to `bypassPermissions`).
