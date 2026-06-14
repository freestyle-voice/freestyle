# Native Windows volume-control helper for audio ducking

**Branch:** `feat/native-windows-volume-control`  
**Base:** `main`

## What this PR does

Replaces the Windows audio-ducking PowerShell/COM backend with a small, persistent native helper written in **C**. The helper opens `IAudioEndpointVolume` on the default playback endpoint once and services volume/mute commands over stdin. The original PowerShell path is kept as an automatic fallback, so ducking keeps working even if the helper fails to start or crashes.

## Why C instead of PowerShell

The old Windows path encoded a C# snippet into base64 and spawned a **new PowerShell process** for every `duck()` and `restore()`. That added noticeable latency, created a process per key-press, and depended on shell round-trips. A warm C helper removes that overhead while preserving the same snapshot/restore safety model.

## C implementation details

- `apps/electron/native/windows-volume-control.c` (new)
  - Persistent helper using Core Audio `IMMDeviceEnumerator` + `IAudioEndpointVolume`.
  - Line-based stdin protocol: `get`, `set <0..1>`, `mute <0|1>`, `quit`.
  - Defines the three required COM GUIDs inline so the binary links with `clang-cl`/`clang` without relying on `uuid.lib` for those symbols.
  - Clean shutdown on stdin EOF, `quit`, Ctrl+C/Close/Logoff/Shutdown events; releases COM objects and calls `CoUninitialize()`.
- `apps/electron/scripts/compile-native.js`
  - Adds `windows-volume-control.exe` to the Windows binary list.
  - Falls back gracefully if compilation fails.
- `apps/electron/src/main/audio-ducking.ts`
  - Adds `NativeWindowsVolumeController`: spawns the helper once, enforces startup (2 s) and per-command (500 ms) timeouts, restarts on failure, and falls back to PowerShell after repeated failure.
  - Keeps snapshot/restore depth logic, `MIN_DUCK_DELTA`, and `RESTORE_EPSILON` unchanged.

## Benefits

- **Snappy:** Volume changes happen as soon as the key event arrives; no PowerShell cold-start overhead per key press.
- **Low overhead:** One persistent helper process reuses the COM endpoint instead of spawning a new process every duck/restore cycle.
- **Predictable:** Direct Core Audio calls replace shelling out, parsing base64, and depending on the PowerShell runtime.
- **Resilient:** If the helper cannot be compiled, is missing, exits unexpectedly, or fails repeatedly, the code automatically falls back to the original PowerShell backend.
- **Clean lifecycle:** The helper exits cleanly on stdin EOF, an explicit `quit` command, or console/session events; all COM objects are released and `CoUninitialize()` is called.
- **Self-contained:** Inline GUID definitions let it link on Windows build hosts that only have `clang-cl` available and lack `uuid.lib`.

## Safety mechanisms

- **Snapshot/restore depth tracking** remains unchanged, so nested duck/restore calls cannot leave the system volume stuck.
- **`MIN_DUCK_DELTA` and `RESTORE_EPSILON`** are preserved, preventing tiny, inaudible volume adjustments and noisy restore attempts.
- **Startup timeout (2 s)** prevents the UI from waiting forever if the helper binary hangs on launch.
- **Per-command timeout (500 ms)** aborts a stuck helper command and triggers a restart.
- **Restart-on-failure with a failure budget** avoids an infinite crash loop; after repeated failures the controller switches back to the proven PowerShell fallback.
- **Safe disposal** kills the helper process and releases all handles/resources when the app quits or the controller is torn down.
- **Unexpected-exit handling** detects when the helper dies and restarts it on the next duck request.

## How to test

1. `pnpm typecheck` in `apps/electron` should pass for both node and web.
2. `pnpm compile:native` on Windows should produce `resources/bin/win32-x64/windows-volume-control.exe`.
3. Manually pipe commands to the helper and verify `get`, `set`, `mute`, and `quit` respond correctly.
4. Run `pnpm build:win` and confirm the installer is signed and contains the new binary.
5. In the running app, hold the push-to-hold key; system volume should duck immediately and restore on release.

## Linux implementation hardening

The Linux audio-ducking path was reviewed and hardened as part of this change:

- **No shell injection surface:** `audio-ducking.ts` invokes `pactl`/`wpctl` through `execFileAsync` with fixed argument arrays; no user-controlled strings are passed to a shell.
- **Bounded C helpers:** `linux-key-listener.c` uses `strncpy` with explicit null-termination and `snprintf` with fixed-size buffers; no raw `strcpy`, `strcat`, `sprintf`, `gets`, or `system` calls are present.
- **Fixed commands only:** `linux-mic-listener.c` uses `popen` only with hard-coded `pactl` commands and reads output with `fgets` into fixed buffers.
- **Single-process/single-thread:** the helpers do not share mutable state across threads, so `strtok` non-reentrancy is not a practical concern.

## Known limitations

- `windows-mic-listener.exe` still fails to link on the clang-cl-only build host because of the same unresolved COM GUID issue. This is pre-existing; mic detection falls back to the legacy path.
- The helper targets the default multimedia playback endpoint only. Per-application ducking is out of scope.

## Checklist

- [x] Native helper implemented in C.
- [x] Native helper compiles with the available Windows toolchain.
- [x] TypeScript typechecks pass.
- [x] PowerShell fallback preserved.
- [x] Snapshot/restore safety logic unchanged.
- [x] Build script updated.
- [x] Installer built and signed.
