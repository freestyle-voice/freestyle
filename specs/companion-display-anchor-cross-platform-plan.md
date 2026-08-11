# Cross-platform companion display anchoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anchor the dictation companion to the display of the focused external
application on macOS, Windows, Linux X11, and Sway.

**Architecture:** A small platform adapter returns a focused external window
rectangle in physical screen coordinates. The main process converts it to
Electron DIP coordinates where required, maps it to a display, and retains the
captured cursor display only as a fallback. Generic Wayland stays on that
fallback because it does not expose other clients' global positions.

**Tech Stack:** Electron main process, TypeScript/Vitest, Win32 C, Xlib C,
Sway IPC JSON, macOS Accessibility.

## Global Constraints

- Exclude Freestyle's process ID from every focused-window result.
- Convert physical Windows and X11 coordinates with Electron's
  `screen.screenToDipRect` / `screen.screenToDipPoint` before display matching.
- Do not add geometry support for generic Wayland compositors; keep fallback.
- Retain request-ID stale-result protection and a bounded adapter timeout.

---

### Task 1: Platform-neutral focused-window parsing and resolution

**Files:**
- Create: `apps/electron/src/shared/focused-window.ts`
- Create: `apps/electron/src/renderer/src/lib/focused-window.test.ts`
- Modify: `apps/electron/src/main/index.ts`

**Interfaces:**
- Produces `parseWindowBounds(output: string): WindowBounds | null`.
- Produces `isExternalWindow(bounds: WindowBounds | null, ownPid: number): boolean`.
- Consumes `WindowBounds` in the main-process display adapter.

- [ ] **Step 1: Write failing parser tests** for valid JSON, zero-sized and
  malformed JSON, and an own-PID result.
- [ ] **Step 2: Run the focused test** and confirm import failure.
- [ ] **Step 3: Implement the minimal parser and PID guard.**
- [ ] **Step 4: Re-run the focused test** and confirm success.

### Task 2: Windows foreground-window adapter

**Files:**
- Create: `apps/electron/native/windows-window-bounds.c`
- Modify: `apps/electron/scripts/compile-native.js`
- Modify: `apps/electron/src/main/index.ts`

**Interfaces:**
- `windows-window-bounds.exe [excludePid]` emits
  `{"x": number, "y": number, "width": number, "height": number, "pid": number}`.

- [ ] **Step 1: Extend parser tests** with a Windows physical rectangle fixture.
- [ ] **Step 2: Run the focused test** and confirm the new fixture fails until
  the parser accepts the platform response.
- [ ] **Step 3: Implement Win32 foreground-window lookup** using
  `GetForegroundWindow`, `GetWindowThreadProcessId`, and `GetWindowRect`; emit
  JSON only for a positive-size external window.
- [ ] **Step 4: Register the helper in the Windows native build list.**
- [ ] **Step 5: Convert its rectangle with `screen.screenToDipRect(null, rect)`
  before `screen.getDisplayMatching` and re-run focused tests.**

### Task 3: Linux X11 and Sway adapters

**Files:**
- Create: `apps/electron/native/linux-window-bounds.c`
- Modify: `apps/electron/scripts/compile-native.js`
- Modify: `apps/electron/src/main/index.ts`
- Modify: `apps/electron/src/renderer/src/lib/focused-window.test.ts`

**Interfaces:**
- `linux-window-bounds [excludePid]` emits the same JSON schema when an EWMH
  active X11 window is available.
- `getSwayFocusedWindowBounds()` returns the same schema from a focused Sway
  node's absolute `rect`.

- [ ] **Step 1: Write failing tests** for Sway's absolute rectangle, own-PID
  Sway node, and unavailable adapters.
- [ ] **Step 2: Run focused tests** and confirm only the unsupported paths fail.
- [ ] **Step 3: Implement the X11 helper** using `_NET_ACTIVE_WINDOW`,
  `_NET_WM_PID`, `XGetWindowAttributes`, and `XTranslateCoordinates`.
- [ ] **Step 4: Register the helper with `-lX11` in the Linux native build.**
- [ ] **Step 5: Implement Sway tree rectangle extraction** and make Linux use
  Sway first on Wayland, X11 otherwise; preserve cursor fallback on all other
  Wayland compositors.
- [ ] **Step 6: Convert X11 physical coordinates using
  `screen.screenToDipPoint` for both corners, then re-run focused tests.**

### Task 4: Integrate and verify display anchoring

**Files:**
- Modify: `apps/electron/src/main/index.ts`
- Modify: `apps/electron/src/shared/companion-position.ts`
- Modify: `apps/electron/src/renderer/src/lib/companion-position.test.ts`

**Interfaces:**
- `getFocusedExternalDisplay()` dispatches to macOS, Windows, X11, or Sway.
- `anchorCompanionForDictation()` preserves current cursor fallback and ignores
  stale results.

- [ ] **Step 1: Write failing tests** for external-display precedence,
  adapter-failure fallback, and a stale result that must not replace a later
  session's display.
- [ ] **Step 2: Run tests** and confirm the stale-result assertion fails with a
  coordinator lacking request protection.
- [ ] **Step 3: Centralize adapter selection and coordinate conversion** while
  preserving the existing request counter.
- [ ] **Step 4: Run Electron unit tests, typecheck, build, end-to-end tests,
  native compilation, and `git diff --check`.**

### Task 5: Update the pull request

**Files:**
- Modify: PR #571 title and description through GitHub CLI.

- [ ] **Step 1: Inspect the full branch diff and current PR metadata.**
- [ ] **Step 2: Set the title to `fix(electron): Anchor companion across displays`.**
- [ ] **Step 3: Describe supported platforms and the generic-Wayland fallback.**
- [ ] **Step 4: Commit, push, and confirm the PR metadata.**
