# Computer Use (experimental, opt-in)

Lets the Freestyle Claude agent **see and control the macOS desktop** — take
screenshots, move/click the mouse, type, and press keys — on top of its normal
Claude Code toolset.

## How it works

The Claude Agent SDK has **no native `computer` tool**, so we expose a desktop
actuator as an **in-process MCP server** (`mcp__computer__*`). The agent calls
those tools; the main process executes them against the real machine and returns
fresh screenshots so the model can decide its next action (the standard
screenshot → act → screenshot agent loop).

- **Engine wiring:** `apps/electron/src/main/agent/session-manager.ts` attaches
  `mcpServers: { computer: createComputerUseServer() }` to `query()` — but only
  when computer use is enabled.
- **Actuator:** `apps/electron/src/main/agent/computer-use.ts`.
  - **Screenshots:** built-in `screencapture` (main display), downscaled to the
    display's **logical** size with `sips` so 1 image pixel = 1 logical point.
  - **Mouse/keyboard:** [`cliclick`](https://github.com/BlueM/cliclick), which
    also uses logical points — so the model's coordinates line up 1:1 with what
    it sees. No Retina coordinate math needed.
- **Tools exposed:** `screenshot`, `left_click`, `right_click`, `double_click`,
  `move_cursor`, `type_text`, `press_key` (chords like `cmd+space`, `cmd+shift+4`).

## Enabling it

For end users of a shipped build, setup is just: **Settings → Computer use →
toggle on**, then approve the macOS permission prompts. The `cliclick` helper is
**bundled with the app**, so there's no separate install.

In **Settings → Computer use (experimental)** there are two rows:

1. **Allow computer use** — the on/off toggle (persists `agentComputerUse` in
   `settings.json`, read fresh each run).
2. **Desktop control helper** — a live status dot for the `cliclick` helper.
   Shows "granted" when ready; otherwise an **Install helper** button (used by
   dev builds that don't ship the bundled binary — it falls back to Homebrew).

You'll also need to grant the app **Screen Recording** (for `screencapture`)
and **Accessibility** (for `cliclick`) in System Settings → Privacy & Security.
macOS prompts for these the first time the agent acts.

### How the helper is bundled

- `cliclick` is vendored into `resources/bin/<platform>-<arch>/` (the same
  convention as the other native helpers like `macos-key-listener`), so it ships
  in `Resources/bin/` and is codesigned with the app — **no Homebrew required at
  runtime**.
- `compile-native.js` copies an installed `cliclick` automatically on build.
  For release machines, run `pnpm --filter @freestyle/electron vendor:cliclick`
  once — it `brew install`s `cliclick` and copies it into resources.
- At runtime, `findCliclick()` prefers the bundled binary, then a Homebrew/PATH
  install. If none is found (or you're not on macOS), the tools return a clear
  error rather than failing silently, and the Settings status reflects it.

## ⚠️ Safety

This is genuinely dangerous and is why it's opt-in and off by default:

- The agent already runs in `bypassPermissions` (full autonomy, no approval
  gate). Adding screen control means a **misheard voice prompt can click and
  type anywhere unattended**.
- Screen contents (web pages, images) can carry **prompt injection** that
  overrides your intent — the agent reads whatever is on screen.

Phase 0's product spec (Part E) calls for a tiered permission / confirmation UX
before computer use ships broadly. This implementation is the **actuator +
plumbing**; the gating UX is still a follow-up. Treat as experimental and only
enable on a machine where you're comfortable with that risk.

## Known limitations / follow-ups

- **macOS only** (uses `screencapture`/`sips`/`cliclick`). Windows/Linux would
  need a different actuator.
- **Main display only**; multi-monitor isn't handled.
- **No scroll tool** yet (use `press_key` with `pagedown`/`pageup` as a
  workaround).
- **Packaging:** verify `cliclick` resolves from a packaged build (we probe
  `/opt/homebrew/bin`, `/usr/local/bin`, and `PATH`).
- **No approval gate** — see Safety above.
