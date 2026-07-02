# Cross-Platform Audit — Freestyle (Mac / Windows / Linux)

**Date:** 2026-06-10
**Scope:** Roadmap goal 1️⃣ — "All features must work _consistently_ across all platforms. Limit the amount of platform divergence."
**Method:** Deep read of the Electron main process, native C/Swift sources, server STT runtimes, packaging/CI config, and renderer. Findings marked **[verified]** were confirmed directly against the code at the cited line; findings marked **[reported]** came from subsystem review and should be re-confirmed before fixing.

---

## TL;DR — the five things to fix first

| # | Issue | Why it matters |
|---|-------|----------------|
| 1 | Default hotkey is `Alt+Space` on every platform | On Windows, Alt+Space opens the window system menu; on many Linux WMs it opens the window menu too. First-run experience on non-Mac is broken out of the box. |
| 2 | Onboarding permission checks are stubs on Windows/Linux | Mic + accessibility report "granted" without checking anything. A Linux user who isn't in the `input` group sails through onboarding, then the hotkey silently degrades or dies. |
| 3 | Silent push-to-talk → toggle degradation | When the native key listener fails (very likely on Wayland), the app falls back to `globalShortcut` in toggle mode with no user-facing notification — and `globalShortcut` itself doesn't work on GNOME Wayland. |
| 4 | No arm64 support on Windows/Linux, no Intel mac binaries | `getBinaryName()` returns `null` on linux-arm64 / win32-arm64 → local transcription dead. CI builds mac only on Apple silicon, so darwin-x64 native binaries are never produced. |
| 5 | Nothing in CI would catch a Windows/Linux regression | E2E runs only on Linux/xvfb (X11). No packaged-artifact verification, no Windows/macOS E2E, no Wayland coverage. |

---

## 1. Global hotkeys & key listening

The architecture is good: per-platform native listeners (`native/macos-key-listener.swift`, `windows-key-listener.c`, `linux-key-listener.c`) spawned from `key-listener.ts`, with an Electron `globalShortcut` fallback in `index.ts`.

### 1.1 [verified] [CRITICAL] Default hotkey `Alt+Space` conflicts with the OS on Windows/Linux
- `apps/electron/src/main/index.ts:1585` — `const DEFAULT_HOTKEY = "Alt+Space"` (also baked into `onboarding.tsx:122`, `pages/settings.tsx:54`, `components/tutorial-demo.tsx`).
- On Windows, Alt+Space is the system window menu. The native listener observes keys via a low-level hook but does not suppress them, so dictation triggers **and** the window menu pops up. On GNOME/KDE it can collide with window-menu / launcher shortcuts.
- **Fix:** make the default platform-aware (e.g. keep `Alt+Space` on macOS; use something like `Ctrl+Alt+Space` or `F9` on Windows/Linux). Centralize the default in one shared constant (it is currently duplicated in at least 4 files) and have onboarding read it from the main process.

### 1.2 [verified] [HIGH] Wayland: no native path, and the fallback doesn't work either
- `apps/electron/native/linux-key-listener.c` is evdev-only (`/dev/input/event*`, needs `input` group). The file header (line ~9) claims "Falls back to X11 XRecord if /dev/input is not accessible" — **no XRecord code exists**. Fix the comment at minimum.
- When evdev fails, `index.ts:1768-1782` falls back to `globalShortcut` — which GNOME Wayland (and most Wayland compositors) does not support. Net result on a stock Ubuntu 24.04 (Wayland) install where the user isn't in `input`: **no hotkey at all**, and the only error surfaces if `globalShortcut.register` returns false.
- **Fix (incremental):**
  1. Detect Wayland + missing `input` group at startup/onboarding (see §3) and show the existing `usermod -aG input` guidance *proactively*, not only after total failure (the message at `index.ts:1795-1800` is good — surface it earlier).
  2. Longer term: evaluate the XDG Desktop Portal `GlobalShortcuts` interface for Wayland (Electron ≥ recent versions expose it via `globalShortcut` on some setups; otherwise libportal).

### 1.3 [verified] [HIGH] Silent push-to-talk → toggle degradation in the fallback
- `index.ts:1768-1774`: when the native listener fails, the fallback registers `globalShortcut` with "toggle semantics" because globalShortcut has no key-up. A push-to-talk user gets different behavior with no notification (a warning goes to the log only).
- **Fix:** send a `hotkey:degraded` event to the renderer and show a one-time banner/toast: "Push-to-talk unavailable (reason); using toggle mode. Fix: …".

### 1.4 [verified] [MEDIUM] No platform-aware hotkey validation (Fn/Globe, right-modifiers)
- macOS supports `Fn`/`Globe` and right-side modifiers via the Swift listener; the Windows/Linux C listeners don't parse those tokens, and `isValidAccelerator()` (`index.ts:1614`) doesn't reject them per platform. A `Fn`-based hotkey on Linux silently never fires.
- **Fix:** reject/strip `Fn`/`Globe` tokens when `process.platform !== "darwin"` in validation and in the recorder UI.

### 1.5 [verified] [MEDIUM] `macFnDown` not reset in `updateHotkey()`
- `key-listener.ts:485-506` clears `macModState`, `macFlagState`, `macHotkeyActive` but not `macFnDown` (declared line 129). Change the hotkey while holding Fn → stale state. One-line fix.

### 1.6 [reported] Lower-priority listener items
- Windows recording: right-modifier events skip `EmitRecordModifiers()` while left ones don't (`windows-key-listener.c` ~260-275) — possible inconsistent UI state while recording a hotkey. **[MEDIUM]**
- `linux-key-listener.c` uses `ioctl()` without `#include <sys/ioctl.h>` (works via `linux/input.h` transitively on glibc; include it explicitly for musl/portability). **[LOW]**
- Linux record-mode key-name map misses multimedia keys; macOS Swift listener misses F13–F24 (Windows/Linux have them — a small divergence). **[LOW]**
- `compile-native.js`: the linux key-listener compile has no retry/fallback and a failure doesn't fail the build — a missing binary is only discovered at runtime. Make native compile failures fail the build (or at least the CI build). **[MEDIUM]**

---

## 2. Paste / text injection & clipboard

`apps/electron/src/main/paste.ts` is well-structured (native binary first, legacy shell fallback per platform). Note: the `wtype -M ctrl -P v -p v -m ctrl` invocation at line 138 **is valid wtype syntax** (an earlier internal review flagged it incorrectly — it's fine).

### 2.1 [verified] [HIGH] No dependency checks or user feedback when Linux paste tools are missing
- X11 path needs `xdotool` (`paste.ts:145`), Wayland legacy path needs `wtype` (`paste.ts:138`). Neither is checked for presence; failures are logged (`tryExecAsync` warn) or thrown, but **the user never sees why their dictation vanished**. Transcribed text survives only on the clipboard.
- **Fix:** at startup (Linux only) probe `which xdotool` / `which wtype` based on session type; surface a persistent settings/onboarding warning with the exact install command (`sudo apt install xdotool` / `wtype`). On paste failure, notify the renderer: "Couldn't paste — text copied to clipboard" (which is actually true, see 2.3).

### 2.2 [verified] [MEDIUM] Wayland detection is heuristic-only
- `paste.ts:48-53` checks `XDG_SESSION_TYPE`/`WAYLAND_DISPLAY`. Under some setups (Xwayland-launched Electron, odd display managers) this misclassifies, and the wrong injector is chosen with no cross-attempt.
- **Fix:** on failure of the selected path, try the other (`xdotool` ↔ `wtype`) before giving up.

### 2.3 [verified] [MEDIUM] Clipboard restore races and can clobber the paste
- `paste.ts:172-197`: prior clipboard is restored in `finally` after a fixed settle delay (100–600 ms). A slow target app (remote desktop, heavy IDE, Electron apps under load) may process Ctrl+V *after* the clipboard was restored → user's *old* clipboard gets pasted instead of the transcript. Also, if a paste backend throws, restore still runs immediately, erasing the transcript from the clipboard — the only place the user could still get it from.
- **Fix:** (a) wrap restore in try/catch with a log; (b) on paste failure, *don't* restore — leave the transcript on the clipboard and tell the user; (c) consider making the settle time configurable or skipping clipboard restore as an option (Wispr Flow-style "keep last transcript in clipboard").

### 2.4 [verified] [LOW] Windows legacy fallback spawns PowerShell per paste
- `paste.ts:87-90` — `Add-Type -AssemblyName System.Windows.Forms` per invocation costs ~0.5–1 s of PowerShell startup. Fine as last resort; just confirm `windows-fast-paste.exe` actually ships (see §6.2) so this path is rarely hit.

---

## 3. Permissions & onboarding

### 3.1 [verified] [CRITICAL] Permission handlers are stubs on Windows/Linux
- `index.ts:1146-1170`: `permissions:check-mic` returns `"granted"` (line 1151), `permissions:request-mic` returns `"granted"` (line 1160), `permissions:check-accessibility` returns `true` on non-mac. Onboarding (`onboarding.tsx:719-778`) therefore shows everything green instantly.
- Reality: Windows 10/11 privacy settings can block mic for desktop apps; Linux needs `input`-group membership for the hotkey and xdotool/wtype for paste. Users complete onboarding with a broken setup and discover it mid-dictation with no explanation.
- **Fix:**
  - **Mic (Win/Linux):** do a real probe — attempt a short `getUserMedia` capture in the onboarding renderer and gate on success; on failure, deep-link to OS privacy settings (`ms-settings:privacy-microphone` on Windows).
  - **Linux "accessibility" equivalent:** check readability of `/dev/input` (e.g. try opening one `event*` device) and presence of paste tooling; reuse the accessibility card to show `sudo usermod -aG input $USER` + package install instructions. This turns the dead onboarding card into the natural home for Linux setup.

### 3.2 [verified] [MEDIUM] Linux frontmost-app detection (context/formats feature) is X11-only
- `index.ts:684-711` uses `xdotool getactivewindow`; returns nothing on Wayland → context-aware formatting silently unavailable. Degrade gracefully (it likely already returns null) but document the divergence and consider compositor-specific fallbacks later (GNOME Shell Eval is locked down; KDE/Hyprland/sway have IPC).

---

## 4. Pill window, tray, window management

These need real-device testing more than code changes — Electron's window flags behave differently per WM.

- **[verified] [MEDIUM]** `setAlwaysOnTop(true, "screen-saver")` — the `"screen-saver"` level is macOS/Windows-meaningful; on Linux many WMs ignore levels. Combined with `setVisibleOnAllWorkspaces(..., { visibleOnFullScreen: true })` (macOS-flavored option), the pill's behavior on Linux is untested. Test on GNOME X11/Wayland + KDE; guard options per platform where they're documented mac-only. (`index.ts:~338-341`)
- **[verified] [MEDIUM]** `app.focus({ steal: true })` is called on all platforms (`index.ts:428, 812`). On Linux WMs focus-stealing prevention may make this a no-op or an annoyance. Use plain `focus()`/`window.show()` on non-mac.
- **[reported] [MEDIUM]** Pill is `focusable: false` + `showInactive()` — correct approach, but Linux WMs don't uniformly honor it; verify the pill doesn't steal focus mid-typing (that would interrupt the very field the user is dictating into).
- **[verified] [LOW]** `app.dock?.show()` calls are safely optional-chained. `window-all-closed` is an intentional no-op (tray app); add a clarifying comment.

---

## 5. Local STT runtimes (whisper.cpp, MLX)

The MLX runtime is correctly gated by `isAppleSiliconMac()` (`apps/server/src/lib/mlx-asr/constants.ts:11`), and `reconcileUnsupportedMlxVoiceDefault()` exists for migrated defaults. Good. The gaps are around whisper.cpp on non-mac:

### 5.1 [verified] [HIGH] No arm64 entries for Linux/Windows → local transcription dead on those machines
- `apps/server/src/lib/whisper/constants.ts:141-151`: `BINARY_NAMES`/`SERVER_NAMES` have `linux: { x64 }` and `win32: { x64 }` only. On linux-arm64 (Raspberry Pi, ARM laptops) or win32-arm64 (Snapdragon X — a growing share of new Windows laptops), `getBinaryName()` returns `null` and local whisper is unavailable with a generic error.
- `electron-builder.yml` likewise hardcodes `resources/whisper/win32-x64` and `linux-x64` (while mac correctly uses `darwin-${arch}`).
- **Fix:** either add arm64 build/download paths (whisper.cpp upstream has arm64 releases for some targets; Linux can build from source which already happens in CI), or fail loudly with a clear "unsupported architecture" message in the model UI instead of a null-binary runtime error.

### 5.2 [verified] [MEDIUM] Windows binary download is hardcoded x64 and CPU-only
- `apps/server/src/lib/whisper/models.ts:423` downloads `whisper-bin-x64.zip`. No arch detection, and the prebuilt Windows binaries are CPU-only — no CUDA/Vulkan. Linux builds from source (`models.ts:306`) also without GPU flags.
- **Consequence:** on Windows/Linux, local transcription latency will be far worse than the mac experience (Metal/CoreML/MLX), and nothing communicates that. This directly hits roadmap goals 2️⃣/3️⃣.
- **Fix (phased):** (1) log + surface the active backend ("CPU") in the model UI; (2) steer Windows/Linux users toward smaller quantized models or cloud models in the opinionated default selection; (3) later, ship Vulkan builds (whisper.cpp `-DGGML_VULKAN=1` works on both Windows and Linux and avoids the CUDA toolchain).

### 5.3 [verified] [MEDIUM] Fresh non-mac install: confirm the opinionated default is platform-aware
- `providers.ts` reconciles *away* from MLX when unsupported, but verify the first-run default selection actually lands on a sensible whisper/cloud model on Windows/Linux rather than `null` ("No model specified"). Add a unit test: simulated `win32`/`linux` platform → default model is non-null and non-MLX.

### 5.4 [verified] [MEDIUM] Model/binary storage uses `~/.cache` on Windows
- `whisper/constants.ts:133-139` — `~/.cache/freestyle/...` is XDG-correct on Linux and acceptable on macOS, but non-standard on Windows (should be `%LOCALAPPDATA%`). Works, but surprises users and backup/cleanup tools. Low urgency; migrate with a fallback read of the old path.

### 5.5 [reported] [LOW] Misc
- `proc.kill(... "SIGTERM")` signal strings are ignored on Windows (Node sends a hard kill); the 5 s/120 s timeout fallbacks cover it. Add a comment so nobody "fixes" it wrong.
- MLX Python-candidate paths (`mlx-asr/python.ts`) are macOS-specific — fine *because* MLX is Apple-only, but add an early platform return so it's structurally impossible to hit elsewhere. The `mlx_asr_worker-darwin-arm64.tar.gz` asset name (`runtime.ts:27`) similarly deserves an early platform guard before any download attempt.
- Whisper download failure (release asset gone, HTTP 404) has no fallback messaging suggesting source build.

---

## 6. Packaging, CI, distribution

### 6.1 [verified] [HIGH] Architecture coverage: what actually gets built
- CI (`.github/workflows/build.yml`): Linux on `ubuntu-latest` (x64), Windows on `windows-latest` (x64), macOS on `macos-14` (**Apple silicon/arm64** — note: an earlier internal claim that macos-14 is Intel was wrong).
- Consequences:
  - **macOS Intel (darwin-x64):** native Swift binaries and the DMG are only built for arm64. If you still advertise Intel mac support, nothing produces it. Either build a second mac job (`macos-13` is x64) / universal binaries (`swiftc -target arm64-apple-macos11 -target x86_64-apple-macos11`), or explicitly drop Intel support in the README.
  - **Windows/Linux arm64:** nothing builds them (consistent with §5.1 — decide supported-arch policy and state it).
- The committed `resources/bin/darwin-arm64/` binaries are dev-convenience artifacts; CI recompiles via `compile:native` in every `build:*` script (verified `apps/electron/package.json:16-22`), so they're not stale in releases — but they *are* unauditable in the repo. Consider gitignoring them and documenting `npm run compile:native` for contributors.

### 6.2 [verified] [HIGH] No verification that packaged apps contain the native binaries
- `extraResources: from resources/bin/${platform}-${arch}` works only if `compile:native` succeeded on the CI runner — and `compile-native.js` does not fail the build when a compile step fails (see §1.6). A toolchain hiccup on the Windows runner would ship an installer with no `windows-key-listener.exe`/`windows-fast-paste.exe`, silently degrading to globalShortcut-toggle + PowerShell paste.
- **Fix (cheap, high value):** add a post-package CI step per platform that lists the artifact and asserts each expected binary exists (`asar`/unzip listing, or run the packaged app with a `--print-binary-paths` flag). Also make `compile-native.js` exit non-zero on failure when `CI=true`.

### 6.3 [verified] [MEDIUM] E2E tests only run on Linux X11 (xvfb)
- `test-electron` job runs on `ubuntu-latest` only. No Windows or macOS E2E, no Wayland. The cheapest meaningful win: run the existing Playwright suite on `windows-latest` and `macos-14` too, and add one test asserting `getNativeBinaryPath()` returns non-null for every expected binary on the current platform.

### 6.4 [reported] [MEDIUM] Auto-update and signing posture on non-mac
- electron-updater: works for NSIS (Windows) and AppImage (`latest-linux.yml`) but **not** for `.deb` installs — deb users will never auto-update and get no message. Detect install type and show a "download update" notice instead.
- Windows artifacts appear unsigned (no signing step/secrets in the Windows job) → SmartScreen warnings, which for a mass-market dictation app is a real adoption blocker. macOS is notarized (`notarize: true`). Plan for a Windows cert (or Azure Trusted Signing); optionally GPG-sign Linux artifacts.

### 6.5 [verified] [LOW] `electron-builder.yml` arch inconsistency
- mac uses `darwin-${arch}` for whisper resources; win/linux hardcode `-x64`. Harmless today, a footgun the day an arm64 build is added. Standardize on `${arch}`.

---

## 7. Renderer / UX consistency

- **[verified] [HIGH]** Hardcoded `⌘` shown to all platforms: `shell.tsx:136` (sidebar shortcuts), `history.tsx:294`, `dictionary.tsx:226` — while `vocabulary.tsx:264` does it conditionally (and with inconsistent formatting, `⌘ K` vs `Ctrl+ K`). Windows/Linux users see mac glyphs. **Fix:** one shared `shortcutLabel()` helper; delete the four ad-hoc versions.
- **[verified] [MEDIUM]** Platform detection in the renderer is inconsistent: `use-hotkey-recorder.ts:8` uses deprecated `navigator.platform`; `onboarding.tsx:45` uses `navigator.userAgent`. **Fix:** expose `process.platform` once via the preload (`window.api.platform`) and use it everywhere — this also unblocks correct conditional padding (next item) and analytics.
- **[verified] [MEDIUM]** `shell.tsx:81` applies `pt-[44px]` (mac traffic-light clearance) on all platforms → dead space under the native title bar on Windows/Linux.
- **[reported] [MEDIUM]** Saved audio input device IDs aren't validated before capture; if the device is gone, recovery happens late (OverconstrainedError at recording time). Fall back to default device with a toast.
- **[verified] [LOW]** Analytics: `onboarding.tsx:182` reports platform as `"mac" | "other"` — you can't measure Windows/Linux funnel health (relevant to the new onboarding-funnel work in `f9fc691`). Report `darwin`/`win32`/`linux`.
- **[reported] [LOW]** Linux mic-activity detection (`mic-listener.ts:85-127`) uses `pactl` — works on PipeWire systems via pipewire-pulse shim usually, but probe and degrade gracefully where absent.

---

## 8. Things that are in good shape (verified, no action)

- `paste.ts` platform dispatch with native-first + legacy fallback design, and the `wtype` invocation syntax.
- MLX is properly gated to Apple silicon, with default-model reconciliation.
- `linux-autostart.ts` is a proper XDG `.desktop` implementation (one bug: see below), correctly bypassing Electron's no-op `setLoginItemSettings` on Linux.
- macOS accessibility handling is careful — notably the comment at `index.ts:1788` refusing to latch `accessibilityConfirmed` from globalShortcut success.
- The Linux `input`-group error message (`index.ts:1795-1800`) with the exact `usermod` command — good; it just needs to fire earlier/more often (§1.2, §3.1).
- Windows whisper-server DLL-missing exit code is special-cased (`WIN_DLL_NOT_FOUND_EXIT`).
- whisper resources are generated in CI by `download-whisper-cpp.mjs --resources` before packaging on every platform (their absence in the local repo is expected, not a bug).

**One autostart bug to fold in:** `linux-autostart.ts:36` writes `Exec="${process.execPath}"`. Under AppImage, `process.execPath` is the transient mount point (`/tmp/.mount_*`) — autostart breaks on next boot. Use `process.env.APPIMAGE` when set. **[verified] [HIGH for AppImage users]** Also consider appending a `--hidden`-style flag so login launch goes straight to tray.

---

## 9. Recommended action plan

### P0 — correctness on first run (small diffs, big impact)
1. Platform-aware `DEFAULT_HOTKEY`; single source of truth shared with renderer (§1.1).
2. Real onboarding gating on Windows/Linux: getUserMedia probe; Linux `/dev/input` + xdotool/wtype checks with copy-pasteable fix commands (§3.1, §2.1).
3. Notify on hotkey degradation (push-to-talk → toggle) and on paste failure ("text is on your clipboard") (§1.3, §2.3).
4. AppImage autostart `$APPIMAGE` fix (§8).
5. `macFnDown` reset; `Fn`/`Globe` rejected in validation off-mac (§1.5, §1.4).

### P1 — CI safety net (so you can ship without owning a Windows box)
6. Run Playwright E2E on `windows-latest` and `macos-14`; add a native-binary-presence test (§6.3).
7. Make `compile-native.js` fail CI on compile errors; add packaged-artifact content assertions per platform (§6.2).
8. Decide and document the supported-arch matrix (drop or build Intel mac; explicit arm64 error messages on Win/Linux) (§5.1, §6.1).

### P2 — parity & polish
9. Renderer: preload `platform` API, shared shortcut-label helper, conditional title-bar padding, real platform in analytics (§7).
10. Whisper on Win/Linux: surface CPU-only backend, bias the opinionated model selection accordingly, evaluate Vulkan builds (§5.2).
11. Windows code signing; deb update notice (§6.4).
12. Wayland roadmap: portal-based global shortcuts, frontmost-app alternatives, mic detection via PipeWire (§1.2, §3.2, §7).

### Manual test matrix (until CI covers it)
Minimum VM sweep before each release — each cell: hotkey (PTT + toggle), paste, pill visibility/focus, onboarding, autostart, model download:

| | Windows 11 x64 | Ubuntu GNOME (Wayland) | Ubuntu (X11) | KDE (Wayland) |
|---|---|---|---|---|
| Priority | **must** | **must** | should | nice-to-have |

GNOME Wayland is the default for the most popular distros and is your worst-case environment (no evdev without group, no globalShortcut, no xdotool) — if Freestyle works there, Linux is largely solved.
