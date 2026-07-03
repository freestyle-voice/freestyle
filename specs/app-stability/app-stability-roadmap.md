# App Stability Roadmap — PR by PR

**Date:** 2026-07-02
**Source:** [`app-stability-audit.md`](app-stability-audit.md) — finding references (e.g. "§3.5") point there.

Ordering principle: ship-safety first (PR 1 makes every later PR trustworthy), then every-session correctness bugs, then platform parity, then efficiency/polish. Each PR is scoped to be independently reviewable and revertible. Sizes: **S** < ~150 lines, **M** < ~500, **L** = larger or needs real-device testing.

---

## Phase 1 — Ship safety & every-session correctness

### PR 1 — CI: make broken builds impossible to ship (S/M) ✦ do this first
The whole audit's scariest cluster: a native compile failure currently ships a green build with hotkey/paste silently degraded.
- Add `#include <sys/ioctl.h>` to `apps/electron/native/linux-key-listener.c` (build-breaks on gcc 14+/clang 15+ today). While in there, fix the false "XRecord fallback" header comment (line 9).
- `apps/electron/scripts/compile-native.js`: exit non-zero on any compile failure when `process.env.CI` is set (keep warn-only for local dev).
- `.github/workflows/build.yml`: change all three artifact uploads to `if-no-files-found: error`; add a post-package step per platform asserting every expected binary exists in `resources/bin/<platform>-<arch>/` (key-listener, fast-paste, mic-listener, output-volume where applicable) and in the packaged artifact.
- Closes: §3.1 ioctl include, §3.6 compile-native swallow, §3.6 no post-package verification, §3.6 `if-no-files-found: warn`.
- Test: intentionally break one native source in a draft PR; CI must go red on all three platforms.

### PR 2 — Dictionary: `$` corruption fix + hot-path efficiency (S)
Deterministic wrong output for any user with `$` in a replacement value; all changes in one server lib + its existing test file.
- `apps/server/src/lib/dictionary-replacements.ts`: use a function replacer (`() => value`) so replacement values are literal.
- Cache compiled regexes keyed on a dictionary-version counter (bump on any dictionary write) instead of recompiling per transcript.
- Batch the per-match `usage_count` UPDATEs into a single transaction executed after text delivery, not inline.
- `packages/validations/src/dictionary.ts`: add sane `.max()` caps on key/value.
- Closes: §3.4 `$` corruption (HIGH), dictionary hot-path cost (MED), no length cap (LOW).
- Test: extend `apps/server/tests/dictionary-replacements.test.ts` with `$&`/`$$`/`` $` `` values; add a perf-shape test (one compile per dictionary version).

### PR 3 — Hotkey resilience: fallback-on-death + stuck-key watchdog (M)
- `apps/electron/src/main/index.ts` (`registerHotkey` onError path): when the native listener permanently gives up (restart cap), install the `globalShortcut` toggle fallback and call `notifyHotkeyDegraded` — today the user silently loses dictation until restart.
- Reset `hotkeyDegradedNotified` on successful re-registration so a later regression re-notifies.
- Add a stuck-down watchdog: if `hotkeyPressed` stays true past a generous ceiling (e.g. 5 min) with no KEY_UP, auto-cancel the recording and reset state.
- Cleanup: delete dead `NativeKeyListener.updateHotkey()` + its preload exposure.
- Closes: §3.1 no-fallback-after-death (HIGH), stuck-recording desync (MED), notify-once flag (LOW), dead code (LOW).
- Test: unit-test the onError branch (kill the child process 6×); manual: hold hotkey, kill listener process, confirm fallback + notification.

### PR 4 — Paste: clipboard restore correctness (M)
The terminal step of every dictation; three findings share one design.
- `apps/electron/src/main/paste.ts`:
  - Before overwriting, snapshot `clipboard.availableFormats()`; if the prior clipboard held non-text formats (image/files/RTF), **skip restore entirely** (leave transcript on clipboard) rather than destroying the user's copy.
  - Lengthen/verify the settle: bump native settle to ≥300 ms and make it configurable; restore only when we saw our own text still on the clipboard at restore time (cheap consumption heuristic: if clipboard changed since we wrote, don't touch it).
  - Serialize `pasteIntoFocusedApp` with a promise chain (same pattern as `linuxUinputCommandChain`).
- Closes: §3.5 restore race (HIGH), non-text clobber (MED), unserialized paste (LOW).
- Test: manual matrix — paste into a slow target (VM/RDP) and verify transcript wins; copy an image, dictate, confirm image survives.

### PR 5 — Wayland paste: wire the portal path + honest onboarding (M)
The correct GNOME fallback already exists in the native binary; it's just never called.
- `apps/electron/src/main/paste.ts`: extend the Wayland chain to uinput → **`--portal`** → wtype; on X11/Wayland misdetection, cross-attempt the other family before giving up.
- `apps/electron/src/main/linux-setup.ts`: probe `/dev/uinput` accessibility (not just wtype/xdotool presence) and report compositor type; onboarding shows the real fix (`usermod`/portal grant) instead of "install wtype".
- `notifyPasteFailed` (index.ts): make the Linux hint compositor-aware.
- Closes: §3.5 GNOME-Wayland dead end (MED-HIGH), env-only detection (MED), onboarding validates wrong tool (LOW).
- Test: needs a GNOME Wayland VM; assert portal permission prompt appears once and pastes land.

### PR 6 — Audio: ducked-volume crash recovery + quit-time resume (S/M)
- Persist `{ducked: true, previousVolume, deviceId?}` to the settings DB just before ducking; clear after successful restore. On app startup, if the flag is set, restore volume (all three duckers).
- `apps/electron/src/main/audio-control/controller.ts:119-120`: make Linux media resume synchronous on quit (execFileSync `busctl`/`playerctl`, mirroring the volume path).
- `mic-listener.ts:116-121`: only respawn the Linux pactl subscriber on non-zero exit (match the generic handler).
- Closes: §3.2 stuck-at-15% (MED), Linux media stays paused (MED), pactl respawn loop (LOW).
- Test: SIGKILL the app mid-recording; relaunch must restore volume. Quit while music paused on Linux; music resumes.

---

## Phase 2 — Platform parity

### PR 7 — Whisper server lifecycle: parity with MLX (M)
- `apps/server/src/lib/whisper/server.ts`: add idle keep-alive unload (reuse the MLX pattern/`unref`'d timer, default ~10 min, shared setting); escalate to SIGKILL after the stop timeout (mirror `mlx-asr/server.ts:526-533`).
- Health-check ownership: have `whisper-server` checked via a request whose response we can attribute (e.g. verify the model-info endpoint shape) instead of accepting any `ok/404/405`; on bind failure, retry on a fallback port and record the active port.
- Closes: §3.3 never idle-unloads (MED), false-positive readiness/port conflict (MED), no SIGKILL (LOW-MED).
- Test: extend `apps/server/tests/mlx-runtime.test.ts`-style coverage for the unload timer; manual: occupy 8178 with `python -m http.server`, confirm clean error/fallback.

### PR 8 — Model downloads: integrity + honest errors (S/M)
- `apps/server/src/lib/whisper/models.ts`: verify sha256 (HF exposes it) instead of the ≥95%-size heuristic; tailored 404/403 messages (copy the MLX wording); relax `buildFromSource` build timeout for slow/ARM boxes (300 s → e.g. 900 s); quote/escape the PowerShell `Expand-Archive` path properly.
- Closes: §3.3 integrity (LOW-MED), 404 messaging (LOW), build timeouts (LOW-MED), PS quoting (LOW).

### PR 9 — Architecture policy: ARM + Intel mac (decision + S code)
Needs a maintainer decision first: support or explicitly reject each of {darwin-x64, win32-arm64, linux-arm64}.
- Minimum (reject): make `getBinaryName()`-null surface as an explicit "unsupported architecture" state in the models UI/API; fix the ARM-Linux source build so a successful build is actually used (the null `getServerBinaryName()` lookup — add arm64 names for the self-built binaries); document the matrix in README.
- Full (support): add arm64 entries + `electron-builder.yml` `${arch}` for win/linux whisper resources + CI matrix entries.
- Closes: §3.3 ARM dead-end (HIGH), §3.6 arch coverage (MED), builder yml hardcodes (LOW).

### PR 10 — Context/formats beyond macOS (L)
Biggest parity gap; split into two commits or two PRs if review gets heavy.
- Wayland frontmost-app detection in `apps/electron/src/main/index.ts`: compositor-specific providers — `swaymsg -t get_tree` (reuse `linux-terminal-focus.ts` logic), GNOME Shell introspect D-Bus, KDE `KWin` scripting D-Bus; fall back to null cleanly.
- Windows/Linux: since URLs aren't available, add title/process-based match patterns to the default format rules (`schema.ts:5-63`) so Gmail/Slack/GitHub rules can fire from window titles (e.g. `- Gmail`, `| Slack`); tighten the substring matcher to word-boundary or anchored matching to kill the `"How to code in Rust"` false-positive class.
- Closes: §3.4 Wayland context dead (HIGH), web-format rules mac-only (MED), substring false positives (LOW-MED).
- Test: manual per-compositor; unit tests for the new matchers.

### PR 11 — Layout-aware paste keystrokes (M, native code)
- Resolve the keycode for the `v` keysym at runtime on every injection path (as X11/XTest already does): Windows `VkKeyScanW(L'v')`, macOS `UCKeyTranslate`-based lookup, uinput/portal via the active XKB keymap.
- Closes: §3.5 layout fragility (MED).
- Test: switch to Dvorak/AZERTY in a VM per platform; paste must still work.

### PR 12 — Renderer platform consistency (S)
- Add one `shortcutLabel()`/`isMac` helper fed by `window.api.platform`; replace hardcoded `⌘` in `shell.tsx:132`, `dictionary.tsx:230`, `history.tsx:327` and the ad-hoc detections in `use-hotkey-recorder.ts`, `vocabulary.tsx`, `settings.tsx`, `use-models.ts`, `onboarding.tsx`.
- Gate `shell.tsx:194` `pt-[44px]` to darwin; give the pill window a solid background fallback on Linux (`transparent` only where compositing is available, or accept black-box and document).
- Closes: §3.6 ⌘ hardcodes (MED), scattered detection (LOW), padding (LOW), §3.2 pill transparency (LOW).

### PR 13 — Default hotkey rethink for Windows/Linux (S code, needs product decision)
`Control+Super` / `Alt+Super` collide with OS Super handling and can't be suppressed.
- Decide new defaults that native listeners can suppress or that don't involve Super (candidates: `Ctrl+Alt+Space`, `F9`, right-modifier holds). Change only `apps/electron/src/shared/hotkey-defaults.ts` — the centralization from #358-era work makes this a one-file change plus onboarding copy.
- Closes: §3.1 Super-default conflicts (MED).

---

## Phase 3 — Efficiency & background hygiene

### PR 14 — macOS key-listener event dedup (S, Swift + TS)
- `macos-key-listener.swift`: emit `FLAGS:` only when the modifier bitmask changes (the flagsChanged monitor already does; apply the same `lastModifierFlags` guard to the keyDown monitor and CGEvent tap).
- `key-listener.ts`: precompute `parseHotkeyParts` once per hotkey change instead of per event.
- Closes: §3.1 per-keystroke overhead (MED perf).

### PR 15 — History retention + indexes (M)
- `schema.ts`: migration adding an index on `transcription_history(created_at)`.
- `history.ts`: make date filters sargable (compare against precomputed ISO bounds instead of wrapping the column in `date(...)`).
- Add a retention setting (30/90/365/∞ days) + startup prune; surface in Settings → Data.
- Closes: §3.4 unbounded history (MED), non-sargable queries (LOW).

### PR 16 — Auto-update hygiene (S)
- Drop the 5-minute check interval to hourly (keep the immediate startup check).
- Detect `.deb` installs (no `process.env.APPIMAGE`, path under `/usr`) → skip auto-download and show a "new version available — download from GitHub" notice instead of silent failure.
- Closes: §3.6 update polling (LOW-MED), deb never updates (MED).

### PR 17 — Streaming robustness (S/M)
- `stream.ts`: add a server-side connect timeout (~10 s) for WS providers that only signal via `onReady`; on timeout, fail the session so the client falls back to batch.
- `elevenlabs.ts:45-49`: AbortSignal on the token fetch.
- Map AI-SDK abort errors to a friendly "provider timed out" message in `transcribe.ts`.
- Closes: §3.3 silent hang (MED), token fetch (part), timeout messaging (LOW).

### PR 18 — Linux subprocess-cost trims (S/M)
- `linux-terminal-focus.ts`: replace the up-to-60-exec ancestor walk with a single `xdotool` chained command (or one `xprop` call), and generate the terminal-identifier list into both TS and C from one source to stop the drift.
- Cache `command -v` capability probes in the audio-control modules across sessions; add `wpctl` support to `mic-listener.ts` to match the ducker.
- Closes: §3.5 per-paste subprocess storm (LOW), identifier drift (LOW), §3.2 pactl-only mic detection (LOW).

### PR 19 — Windows signing + plugin-install robustness (M, external dependency)
- Set up Azure Trusted Signing (or cert) and wire `CSC_LINK`/signing into `build-windows`; remove the dead `.msi` upload glob.
- `installer.ts`: add a `tar.x` `filter` (regular files/dirs only) + `onwarn` logging, and a friendly error for Windows reserved-name/MAX_PATH failures.
- Closes: §3.6 unsigned Windows (MED), tar extraction (MED), msi glob (cosmetic).

### PR 20 — CI E2E expansion (M, follows PR 1)
- Run the existing Playwright suite on `windows-latest` and `macos-14`; add one test asserting `getNativeBinaryPath()` returns non-null for every expected binary on the current platform.
- Closes: §3.6 E2E Linux-only (MED).

---

## Suggested sequencing

```
Week 1   PR 1 (CI safety)  →  PR 2 (dictionary)  →  PR 3 (hotkey resilience)
Week 2   PR 4 (clipboard)  →  PR 6 (audio recovery)  →  PR 16 (updates)  →  PR 12 (renderer)
Week 3   PR 5 (Wayland portal)  →  PR 7 (whisper lifecycle)  →  PR 8 (downloads)
Week 4+  PR 9/13 (decisions)  →  PR 10 (context parity, L)  →  PR 11 (layouts)
Then     PR 14, 15, 17, 18, 19, 20 as capacity allows
```

Dependencies: PR 20 depends on PR 1 (binary assertions reuse its manifest). PR 5 and PR 10 both want a GNOME-Wayland test VM — set one up once, use for both. PR 9 and PR 13 need maintainer decisions before code.

Product-feature proposals from the audit (§5.3 — System Health panel, latency waterfall, recover-last-transcript, test-dictation onboarding step) are deliberately excluded here; they deserve their own specs once this stability pass lands.
