# App Stability Audit — Cross-Platform & Efficiency

**Date:** 2026-07-02
**Spec:** [`check-app-stability.md`](check-app-stability.md)
**Method:** Six parallel deep-read audits over the full codebase (hotkeys/permissions, paste/output, recording/pill/audio-control, transcription engines, post-processing/customization/history, packaging/CI/renderer). Every finding cites current file:line. Findings from the prior audit (`cross-platform-audit.md`, 2026-06-10) were re-verified against HEAD (`40a9c2e`) — many are now **fixed**; those still open are marked STILL-PRESENT. This document records problems only — no fixes have been applied.

---

## 1. Feature priority (by usage)

Ranked by how often a user exercises the feature. P0 features run on **every single dictation**; a bug there is a bug in 100% of sessions.

| Rank | Feature | Why this rank |
|---|---|---|
| 1 | Global hotkey & key listening | Entry point of every session; if it fails there is no app |
| 2 | Audio capture (mic, streamer, pill recording) | Every session |
| 3 | Transcription (local Whisper/MLX, cloud STT, streaming) | Every session |
| 4 | Post-processing (LLM cleanup, dictionary, vocabulary, formats) | Every session (cleanup + dictionary run by default) |
| 5 | Output delivery (paste/text injection) | Every session — the terminal step; failure = transcript lost |
| 6 | Audio ducking / media pause | Every session for users with playback active |
| 7 | Pill window UI & positioning | Every session (visual surface) |
| 8 | Onboarding & permissions | Once per install, but gates whether anything else ever works |
| 9 | Models management & downloads | Occasional, but blocking when needed |
| 10 | History / Today / usage stats | Written every session, viewed occasionally |
| 11 | Cloud auth & sync | Login-time + background |
| 12 | Plugins | Opt-in |
| 13 | Packaging, auto-update, autostart | Background, but determines install integrity for everyone |

---

## 2. Top findings (fix-first list)

| # | Finding | Sev | Feature | Platforms hit |
|---|---|---|---|---|
| 1 | `linux-key-listener.c` calls `ioctl()` without `#include <sys/ioctl.h>` → **fails to compile on gcc 14+/clang 15+** — and `compile-native.js` never fails the build, and CI never verifies binaries in artifacts → a broken Linux (or any) build **ships silently** with hotkey/paste degraded | HIGH | Hotkey + CI | Linux (compile), all (pipeline) |
| 2 | Native key listener that dies *after* a successful start (restart cap exceeded) leaves the user with **no hotkey, no fallback, no notification** until app restart | HIGH | Hotkey | All |
| 3 | Dictionary replacement values containing `$` are corrupted — raw value passed to `String.replace`, so `$&`, `$$`, `` $` ``, `$'`, `$1` are interpreted | HIGH | Dictionary | All |
| 4 | Clipboard restore race: restore fires after a fixed settle delay (150 ms native) with no confirmation the target app consumed the paste → slow targets (RDP/VNC, loaded apps) paste the *old* clipboard | HIGH | Paste | All |
| 5 | Local Whisper is dead on ARM: `BINARY_NAMES`/`SERVER_NAMES` lack `linux-arm64`/`win32-arm64`; on ARM Linux the source build *succeeds* but the null server-name lookup makes it report failure anyway | HIGH | Transcription | Win-ARM, Linux-ARM |
| 6 | Context-aware formats are dead on Wayland (frontmost-app detection is `xdotool`-only) and web-app format rules effectively **macOS-only** (Win/Linux payloads carry no URL, so domain rules like `mail.google.com` never fire) | HIGH | Formats | Linux, Windows |
| 7 | GNOME Wayland paste has no working fallback: uinput needs `/dev/uinput` access, `wtype` doesn't work on GNOME — and the native binary's D-Bus portal path (`--portal`), which *would* work, is **never invoked** (dead code) | MED-HIGH | Paste | Linux (GNOME Wayland) |

---

## 3. Findings by feature

Status legend: **STILL-PRESENT** (from 2026-06-10 audit), **NEW**, **FIXED** (verified resolved, listed for the record).

### 3.1 Global hotkey & key listening (priority 1)

**Fixed since last audit (verified):** platform-aware default hotkey centralized in `apps/electron/src/shared/hotkey-defaults.ts:11` (darwin=`Fn`, win32=`Control+Super`, linux=`Alt+Super`); push-to-talk→toggle degradation now notifies the user (`index.ts:2145-2164`); Fn/Globe rejected on non-mac (`index.ts:2038-2045`); `macFnDown` reset fixed; real mic-permission checks on mac/win, renderer `getUserMedia` probe on Linux; onboarding blocks Wayland users lacking `/dev/input` access (`onboarding.tsx:917`). Commits #358 (solo-Fn grace window) and #346 (exact suppression matching) verified correct.

| Status | Sev | Finding |
|---|---|---|
| STILL-PRESENT | HIGH | `linux-key-listener.c:189` uses `ioctl()` with no `<sys/ioctl.h>` include (includes at lines 18-28 don't declare it). gcc 14+/clang 15+ treat implicit declarations as errors → compile fails; `compile-native.js:237` only warns → binary silently absent → all Linux users degrade to globalShortcut toggle (or nothing on Wayland). |
| NEW | HIGH | No fallback or notification when the native listener dies after a successful start. `key-listener.ts:504-520` retries 5× then calls `onError`; `index.ts:2261-2264` only logs because `started` was already true — the globalShortcut fallback branch (`:2289`) is never entered. Dictation silently stops until restart. |
| NEW | MED | Stuck-recording desync: `hotkeyPressed` (`index.ts:2118-2143`) is the only state; a dropped KEY_UP (known possible on macOS monitors — see comment at `macos-key-listener.swift:382` — and unguarded on Win/Linux) leaves it `true` forever: pill open, mic hot, hotkey dead. No watchdog. |
| NEW | MED | Default Win/Linux hotkeys are modifier-only chords involving **Super** (`hotkey-defaults.ts:16-18`), which the native listeners cannot suppress (`windows-key-listener.c:316-331`; evdev can't suppress at all) → pressing the default hotkey can also open the Start menu / GNOME Activities; ordinary Ctrl/Win system shortcuts can spuriously start dictation. |
| NEW | MED (perf) | macOS listener emits 2-3 stdout lines per keystroke **system-wide** (NSEvent monitor + CGEvent tap both emit FLAGS unconditionally — `macos-key-listener.swift:377,402`), each parsed in main with `parseHotkeyParts` re-run per event (`key-listener.ts:96-114,419,451`). Continuous IPC + string parsing during all typing anywhere on the machine. |
| STILL-PRESENT | MED | `linux-key-listener.c:9` header comment still falsely claims an X11 XRecord fallback that doesn't exist. |
| NEW | LOW | `hotkeyDegradedNotified` (`index.ts:2147`) never resets across re-registration — a later regression in the same session shows no second notification. |
| NEW | LOW | `NativeKeyListener.updateHotkey()` is dead code — `hotkey:update` IPC constructs a brand-new listener (`index.ts:2257`); still exposed via preload. |
| NEW | LOW | Recorder emits captured combos without platform validation; `isValidAccelerator` runs only later at registration, so an invalid capture surfaces as a delayed `hotkey:error`. |
| NEW | LOW | X11 users without `input`-group access are *not* blocked in onboarding (`linuxBlocked` false on X11) and silently land on globalShortcut toggle — works, but push-to-talk quietly unavailable. |

### 3.2 Audio capture, pill window, ducking/media (priorities 2, 6, 7)

**Fixed since last audit (verified):** multi-monitor pill positioning now cursor-anchored with per-display dock-aware bottom offset (`index.ts:372-458`); `app.focus({steal:true})` gated to darwin (`:596-598, :1133-1135`); saved-device `OverconstrainedError` fallback (`recorder.ts:42-54`); the ducking-restore race (all restore paths route through `restoreSystemAudioSafely` awaiting `duckingPromiseRef`). Ducking is implemented on **all three platforms** with consistent scales and idempotent duck (never raises an already-low volume).

| Status | Sev | Finding |
|---|---|---|
| NEW | MED | Crash mid-duck leaves system volume stuck at 15% forever: pre-duck volume snapshot is memory-only (`macos-audio-ducker.ts:36`, `windows:36`, `linux:133`); graceful quit restores (`index.ts:2323,2359`) but hard crash/SIGKILL does not, and next launch has no recovery. All platforms. |
| NEW | MED | Linux media resume is fire-and-forget on quit: `controller.ts:119-120` does `void linuxMediaPlayback.resumePlayback()` inside `restoreSync()` while mac/win have true sync restores — quitting while media is paused leaves Spotify/browser paused. |
| NEW | MED (perf) | Windows media pause/resume spawns **PowerShell per event** (`windows-media-playback.ts:137,157`) — 200 ms–1 s cold start added to recording start; and `resumePlaybackSync` (`:227-239`, `execFileSync`) on quit can block app exit up to 5 s. |
| STILL-PRESENT | LOW | Linux mic-activity detection is `pactl`-only (`mic-listener.ts:85-128`) with no `wpctl` fallback — inconsistent with the ducker which prefers `wpctl`; plus the Linux `close` handler (`:116-121`) respawns unconditionally every 5 s even on clean exit. |
| STILL-PRESENT | LOW | `setAlwaysOnTop(true,"screen-saver")` + `visibleOnFullScreen` (mac-only option) unconditional at `index.ts:489-492` — WM-dependent behavior on Linux/Wayland (pill may not float above fullscreen apps). |
| NEW | LOW | Pill window is `transparent:true` unconditionally (`index.ts:466-473`); on compositor-less Linux/X11 setups transparent windows render as an opaque/black box; no solid fallback (settings window *is* platform-gated). |
| STILL-PRESENT | LOW | Streamer WebSocket reconnects on a fixed 1 s interval with no backoff/cap (`streamer.ts:264-271`) — infinite 1 s retries if the local server stays down. Localhost-only, so tolerable. |
| NEW | LOW | macOS media control uses the **private MediaRemote framework** via dlopen (`macos-media-control.swift:81-96`); macOS 15.4+ restricts these calls — pause/resume may silently no-op on newer macOS (degrades cleanly, no crash). |
| NEW | LOW | `analyserCtxRef` AudioContext never closed on pill unmount (`app.tsx:529`); 15 s stream-fallback timer never cleared on success (`app.tsx:780-794`, self-guarded no-op). |

### 3.3 Transcription (priority 3)

**Fixed since last audit (verified):** MLX default reconciled away on unsupported platforms → Whisper `base-q5_1` (`mlx-asr/reconcile.ts:28-72`); Windows `proc.kill` passes `undefined` instead of ignored `"SIGTERM"` (all 6 kill sites); MLX python paths/worker download effectively platform-guarded via `isAppleSiliconMac()` gates; stop-server-before-delete (#344) and ASR line-break collapsing (#348) present. MLX lifecycle is in strong shape (serialized lock, generation guards, 10-min idle unload, atomic staged runtime promote).

| Status | Sev | Finding |
|---|---|---|
| STILL-PRESENT | HIGH | ARM dead-end: `whisper/constants.ts:141-151` has only x64 entries for linux/win32. On linux-arm64 the source build **succeeds** but `getServerBinaryName()` returns null so `buildFromSource` throws "build completed but whisper-server not found" (`models.ts:430-434`). On win32-arm64 the x64 zip downloads but the binary never resolves. No "unsupported architecture" messaging. |
| NEW | MED | Whisper server never idle-unloads: no equivalent of MLX's keep-alive (`mlx-asr/server.ts:474-495`); once started, `whisper-server` holds model RAM (up to ~6 GB) until app exit. |
| NEW | MED | Hardcoded port 8178 with false-positive readiness: health check accepts `ok || 404 || 405` (`whisper/server.ts:171`) with no ownership verification — an unrelated service on 8178 makes Freestyle POST `/inference` to a foreign server; a genuine conflict burns a 90 s timeout. |
| NEW | MED | Streaming bring-up can hang silently: WS providers only signal via `onReady`; `stream.ts:131-153` has no server-side connect timeout for them, so a socket that opens but never responds leaves the client waiting forever (hard errors *are* handled). ElevenLabs token fetch (`elevenlabs.ts:45-49`) has no AbortSignal either. |
| STILL-PRESENT | MED (perf) | Windows download is x64 CPU-only (`models.ts:443`); Linux source build has no GPU flags (`models.ts:375-378`); nothing surfaces "CPU backend" to the user — mac-vs-others latency gap invisible. |
| NEW | LOW-MED | No download integrity check: `isModelDownloaded` accepts any file ≥ 95% of expected size (`models.ts:88-93`); corrupt downloads fail later at model load with an opaque error. No resume for the 1.6 GB models. |
| NEW | LOW-MED | Whisper `stopServer` never escalates to SIGKILL (`server.ts:270-278`, re-sends SIGTERM) — a hung server survives; MLX escalates correctly (`mlx-asr/server.ts:526-533`). |
| NEW | LOW-MED | `buildFromSource` timeouts (60 s configure / 300 s build, `models.ts:376-378`) too tight for slow/ARM Linux boxes → spurious "Failed to build". |
| STILL-PRESENT | LOW-MED | Models/binaries under `~/.cache` on Windows (`whisper/constants.ts:134,185`, `mlx-asr/constants.ts:106`) instead of `%LOCALAPPDATA%` — multi-GB payloads in a non-idiomatic location. |
| STILL-PRESENT | LOW | Whisper download 404s surface as bare "HTTP 404" (`models.ts:225,337,453`); MLX has tailored 404/403 messages, Whisper doesn't. |
| NEW | LOW | Cloud batch timeout reaches the user as "The operation was aborted" (`transcribe.ts:266-270` passes raw `err.message`). |
| NEW | LOW | MLX per-request temp-file churn: every streaming commit does two full buffer copies + disk round-trip (`mlx-asr/server.ts:170-213`, `mlx-local.ts:178-194`). |
| NEW | LOW | Windows zip extract builds a single-quoted PowerShell string (`models.ts:462-465`) — breaks (or injects) if the path contains `'`. |

### 3.4 Post-processing, dictionary, vocabulary, formats (priority 4)

**Fixed since last audit (verified):** auto-detect language constraint present (`editor/prompts.ts:82-100`, commit #345). In good shape: cleanup failure always falls back to delivering the raw transcript; dictionary key escaping + unicode/CJK boundary handling is thoughtful; DB pragmas (WAL, busy_timeout, NORMAL) correct; migrations transactional; SQL parameterized/allowlisted throughout.

| Status | Sev | Finding |
|---|---|---|
| NEW | HIGH | Dictionary replacement **values** are passed raw to `String.replace` (`dictionary-replacements.ts`): `$&`, `$$`, `` $` ``, `$'`, `$1` in a user's replacement value are interpreted as replacement patterns → deterministic corrupted output on every affected transcript (e.g. value `"A$$B"` renders `"A$B"`). Keys are escaped; values are not. |
| STILL-PRESENT | HIGH | Frontmost-app detection on Linux is `xdotool`-only (`index.ts:945-973`) → context/formats silently dead on Wayland. The codebase already has Wayland know-how (`linux-terminal-focus.ts:183` uses `swaymsg`) but only for the paste path. |
| NEW | MED | Web-app format rules are effectively macOS-only: only mac context extraction yields URLs (`index.ts:830-902`); Windows (`:905-943`) and Linux (`:946-973`) send process+title only, and browser titles don't contain domains — so default rules keyed on `mail.google.com`, `slack.com`, `github.com` etc. (`schema.ts:5-63`) almost never fire off-mac. Firefox-on-mac has the same gap. |
| NEW | MED (perf) | Dictionary hot path: per transcript, every row gets a freshly compiled RegExp + full-text scan (O(N·len)), then each match fires an individual synchronous `UPDATE usage_count` — unbatched writes on the delivery critical path. Scales badly with large dictionaries. |
| NEW | MED | History unbounded: no retention/TTL/cap, no index on `created_at` (`schema.ts:186`); `/stats` aggregates the whole table per call; search uses `LIKE '%x%'` and date filters wrap the column in `date(...,'localtime')` (`history.ts:60-73,108-120`) — non-sargable. Degrades steadily for heavy users. |
| NEW | LOW-MED | Format matching is substring-over-concatenated-fields (`rewrite-context.ts:buildMatchContext`): short default patterns (`Code`, `mail`, `Messages`) false-positive on unrelated window titles (a page titled "How to code in Rust" gets Code-Editor register). |
| NEW | LOW | Electron main opens transient `DatabaseSync` handles with no busy_timeout (`index.ts:634-639, 2057-2061, 2077-2081`) alongside the server's WAL connection — a coinciding write can throw `SQLITE_BUSY`, swallowed by try/catch → hotkey/mode silently falls back to defaults. |
| NEW | LOW | No length cap on dictionary key/value (`packages/validations/src/dictionary.ts` has `.min(1)` only) — compounds the hot-path cost. No case adaptation of replacement values (by-design, undocumented). |
| NEW | LOW | Post-process input is unbounded (no cap on `body.text`) and the transcript is interpolated into the prompt unescaped — cost/steering exposure, low risk since users dictate their own text. |

### 3.5 Output delivery / paste (priority 5)

**Fixed since last audit (verified):** transcript preserved on paste-backend failure (restore only when `pasted === true`, `paste.ts:377,386-393`); `notifyPasteFailed` (`index.ts:2170-2186`) gives per-platform guidance, rate-limited; Linux onboarding now checks for a paste tool (`linux-setup.ts:47`). Design is right: clipboard-based (UTF-8/emoji/CJK safe, O(1) for long text), native-first with legacy fallback, non-activating pill so focus stays in the target app.

| Status | Sev | Finding |
|---|---|---|
| STILL-PRESENT | HIGH | Clipboard restore race: restore fires after fixed settle delays (native 150 ms mac/win, 100 ms linux; legacy 300-600 ms — `paste.ts:332-342`) with no confirmation of consumption. Slow targets (RDP/Citrix/VNC, loaded Electron apps) paste the restored *old* clipboard instead of the transcript. The Linux uinput helper reports OK before compositor delivery, worsening the 100 ms window. |
| NEW | MED | Restore clobbers non-text clipboard: `prior = clipboard.readText()` (`paste.ts:353`) captures only the text flavor; restoring via `writeText` destroys images/files/RTF the user had copied. |
| NEW | MED | GNOME Wayland has no working paste fallback: uinput requires `/dev/uinput` access; `wtype` is not supported by GNOME/Mutter; the native binary's D-Bus RemoteDesktop portal path (`linux-fast-paste.c --portal`) is **never invoked by paste.ts** — the correct fallback exists as dead code. The failure notification then recommends installing wtype, which won't help. |
| NEW | MED | Layout fragility: uinput/portal inject physical scancode `KEY_V` (`linux-fast-paste.c:459,493`), Windows uses `VK_V`, macOS `kVK_ANSI_V` — on Dvorak/AZERTY/Colemak the physical V position isn't "V", so paste fails or triggers another shortcut. Only the X11/XTest path is layout-aware (`XKeysymToKeycode(XK_v)`, `:667`). |
| NEW | MED | Silent-success class: backends can report success when nothing pasted (wtype accepted-but-ignored, no editable control focused) → `pasted=true`, clipboard restored, no notification, transcript gone. |
| STILL-PRESENT | MED | Wayland-vs-X11 detection is env-var-only (`paste.ts:54-59`) with fallback chains *within* each family but no cross-family retry if detection is wrong. |
| NEW | LOW | Onboarding validates only the legacy tool (wtype/xdotool, `linux-setup.ts:49`), not `/dev/uinput` access — a GNOME Wayland user passes onboarding with a setup where every paste will fail. |
| NEW | LOW | `pasteIntoFocusedApp` isn't serialized (`paste.ts:344-395`) — overlapping rapid dictations can interleave clipboard save/restore. |
| NEW | LOW | X11 terminal detection spawns up to ~60 `xdotool` subprocesses per paste (20-level ancestor walk × 3 calls — `linux-terminal-focus.ts:81-124`); TS `TERMINAL_IDENTIFIERS` list has drifted from the C `terminal_classes[]` despite the "keep in sync" comment. |
| STILL-PRESENT | LOW | Windows PowerShell `SendKeys` fallback still ~0.5-1 s per paste (`paste.ts:93-96`) — rare in packaged builds. Windows also never uses Ctrl+Shift+V (no terminal detection off-Linux, `windows-fast-paste.c:22-29`). |

### 3.6 Packaging, CI, auto-update, renderer consistency (priorities 8, 13)

**Fixed since last audit (verified):** AppImage autostart uses `process.env.APPIMAGE` (`linux-autostart.ts:38-43`); macOS glass/vibrancy correctly gated with solid non-mac fallbacks (`dashboard.tsx:59`, `globals.css:218-282`); onboarding analytics reports real platform; tray is properly platform-aware; single-instance lock, protocol registration, plugin-install integrity checks (SRI) and atomic staging all sound; #381 (`--latest=false` for package releases) verified.

| Status | Sev | Finding |
|---|---|---|
| STILL-PRESENT | HIGH | `compile-native.js` never fails the build — every compile failure is warn-and-continue; `build:mac/win/linux` chain on it → a runner missing a toolchain ships installers without key-listener/fast-paste binaries. |
| STILL-PRESENT | HIGH | No post-package verification: CI verifies whisper resources but nothing asserts `resources/bin/<platform>-<arch>/` contents nor inspects the packaged artifact (`build.yml:204,230`). Compounds the above: broken builds pass green. |
| NEW | MED | `if-no-files-found: warn` on all three artifact uploads (`build.yml:264,319,362`) and `ci-status` checks only job results — a platform producing zero artifacts still releases, silently missing that platform. |
| STILL-PRESENT | MED | `.deb` installs never auto-update and get no message: updater initialized unconditionally (`index.ts:1768-1861`) with no AppImage-vs-deb branch; electron-updater errors are shown only in the settings window. |
| STILL-PRESENT | MED | Windows artifacts unsigned (no signing env in `build.yml:334`; contrast mac at `:305`) → SmartScreen warnings on every install. |
| STILL-PRESENT | MED | Arch coverage: mac builds arm64-only (`build.yml:233` macos-14, no matrix) — no Intel mac artifacts; no win/linux arm64; no documented supported-arch policy. `electron-builder.yml` hardcodes `win32-x64`/`linux-x64` whisper resources (lines 22, 63) while mac uses `${arch}`. |
| STILL-PRESENT | MED | E2E only on ubuntu-latest/xvfb (X11) (`build.yml:179`) — no mac/win E2E, no Wayland; native paste/hotkey paths never exercised in CI. |
| NEW | LOW-MED | Update-check polling every 5 minutes for the entire app uptime (`index.ts:1751-1759`) plus an immediate check — aggressive vs. hourly/daily norm. |
| NEW | MED | Plugin tar extraction (`installer.ts:127-134`): no `filter`/`onwarn`; Windows reserved names/`:` paths throw opaque `EPERM/EINVAL`; deep trees can hit MAX_PATH — a plugin that installs on mac/Linux fails cryptically on Windows. |
| STILL-PRESENT | MED | Hardcoded `⌘` shown to all platforms: `shell.tsx:132`, `dictionary.tsx:230`, `history.tsx:327` (while `vocabulary.tsx:267` does it conditionally) — Win/Linux users see mac glyphs for Ctrl shortcuts. |
| STILL-PRESENT | LOW | Platform detection scattered: canonical `window.api.platform` exists (`preload/index.ts:20`) but `use-hotkey-recorder.ts:8` uses deprecated `navigator.platform`; `vocabulary.tsx:267`, `settings.tsx:170`, `use-models.ts:25`, `onboarding.tsx:70` use `navigator.userAgent`. |
| STILL-PRESENT | LOW | `shell.tsx:194` applies mac traffic-light padding `pt-[44px]` on all platforms — dead space under native title bars on Win/Linux. |

---

## 4. What's in good shape (no action needed)

- **Hotkey lifecycle**: clean process teardown, capped linear-backoff restarts, no busy loops, concurrency guards, event taps self-heal (`key-listener.ts`, native listeners).
- **Paste architecture**: clipboard-based (unicode-safe, O(1)), native-first, transcript preserved on hard failure, non-activating pill window.
- **MLX runtime**: serialized lifecycle lock, stale-result generation guards, idle unload with keep-alive, atomic staged upgrades, tailored error messages.
- **Ducking**: implemented on all three platforms, consistent scales, idempotent, restore race fixed; Linux/Windows media pause is per-session precise (better than mac's global command).
- **DB layer**: WAL + busy_timeout + transactional migrations; parameterized and allowlisted SQL everywhere.
- **Cleanup pipeline**: LLM failure always falls back to raw transcript; filler-only short-circuit avoids pointless LLM calls; auto-detect language constraint present.
- **Multi-monitor pill positioning**: cursor-anchored, dock-aware, off-screen reset, programmatic-move guards.
- **Packaging hygiene**: AppImage autostart, glass gating, tray per-platform, single-instance, plugin SRI verification + atomic staging, read-only-location update guard on mac.
- **Streaming session hygiene**: bounded reconnects, pending-audio caps with client notification, warm-session reuse, Soniox ephemeral-session policy.

---

## 5. Proposed improvements

### 5.1 Reliability (address the audit's recurring themes)

1. **Paste verification loop** — instead of fixed settle delays, poll `clipboard` ownership/consumption or use a short verification window before restoring; skip restore entirely when the prior clipboard had non-text formats; never restore on any uncertainty (leave transcript in clipboard + toast). Kills findings 3.5-#1/#2/#5 in one design.
2. **Wire up the Wayland portal path** — `linux-fast-paste.c --portal` already implements the XDG RemoteDesktop portal; invoke it from `paste.ts` as the GNOME fallback (uinput → portal → wtype). Also probe `/dev/uinput` access in `linux-setup.ts` so onboarding reflects reality.
3. **Hotkey watchdog + last-resort fallback** — on native-listener permanent death, install the globalShortcut fallback and notify (reuse `notifyHotkeyDegraded`); add a stuck-down timeout (e.g. hold > 5 min → auto-cancel) to recover from missed KEY_UPs.
4. **Ducked-state persistence** — persist `{ducked: true, previousVolume}` to disk before ducking, clear after restore; on startup, if the flag is set, restore volume. Also make Linux media resume synchronous on quit (`controller.ts:119-120`).
5. **CI: make broken builds impossible to ship** — `compile-native.js` exits non-zero when `CI=true`; post-package step asserts every expected native binary exists in the artifact; `if-no-files-found: error`; add the `sys/ioctl.h` include. This cluster is the cheapest, highest-leverage set in the whole audit.
6. **Whisper server parity with MLX** — idle keep-alive unload, SIGKILL escalation, dynamic port (or health-check ownership token), checksum-verified downloads.
7. **Dictionary correctness + speed** — escape `$` in replacement values (or use a function replacer); compile one alternation regex cached until the dictionary changes; batch usage_count updates in one transaction after delivery.

### 5.2 Cross-platform parity

8. **Context/formats off macOS** — add Wayland frontmost-app detection (compositor-specific: `swaymsg`, KDE/GNOME D-Bus — the terminal-focus module already does sway); on Windows, resolve browser URLs via UI Automation (or match on exe + title keywords as a stopgap); revisit default format rules so they can fire from process/title alone.
9. **Layout-aware paste** — resolve the keycode for the "v" keysym at runtime on every path (as X11/XTest already does) instead of hardcoding physical scancodes.
10. **Declare the arch matrix** — decide Intel mac / win-arm64 / linux-arm64 support; where unsupported, show an explicit "unsupported architecture" message in the models UI instead of null-binary failures; where supported, fix `BINARY_NAMES` + `electron-builder.yml` `${arch}`.
11. **One `platformShortcut()` helper** — single source for ⌘/Ctrl labels fed by `window.api.platform`; delete the four ad-hoc detections; gate `pt-[44px]` and transparency per platform.

### 5.3 Product ideas (creative)

12. **"System Health" panel in Settings** — live diagnostics reusing `linux-setup.ts` checks + new probes: paste tool present, `/dev/input` + `/dev/uinput` access, compositor type, mic permission, whisper backend (CPU/Metal), key-listener alive, last paste result. Turns this audit's entire "silent failure" class into user-visible, self-serviceable state. Big Linux-adoption lever.
13. **Latency breakdown per dictation** — record per-stage timings (capture → STT → cleanup → paste) in history rows; show a small waterfall in History/Today. Directly serves roadmap goal 2️⃣ and guides users to faster models; also gives you telemetry to find regressions.
14. **"Recover last transcript" hotkey + toast** — after any paste failure (or silent success), a toast with the transcript and a re-paste button; a global "paste last dictation again" shortcut. Guarantees users never lose words even when injection fails.
15. **Live partial-transcript preview in the pill** — streaming providers already produce partials; render them (grayed) in the pill so users trust the system during long dictations.
16. **Per-app format capture** — "Create format for this app" button that snapshots the current frontmost app/URL into a new format rule, instead of hand-typing match patterns; fixes discoverability and reduces reliance on fragile default substring rules.
17. **History retention setting + indexes** — retention picker (30/90/∞ days), `created_at` index, and a background prune; pair with a WAL-checkpoint/VACUUM on quit.
18. **Surface the STT backend** — badge in the models page ("Metal", "CPU — expect slower"), and bias the recommended-model logic by measured device throughput (a 3 s micro-benchmark on first run), not just platform.
19. **Windows code signing** — Azure Trusted Signing is now cheap and CI-friendly; SmartScreen warnings are a real adoption blocker for a mass-market dictation app.
20. **Onboarding "test dictation" step** — a final onboarding card that has the user dictate into a built-in text box exercising the *full* pipeline (hotkey → record → STT → paste into the box). Every silent-failure mode found in this audit would surface right there, at setup time, instead of mid-work.
