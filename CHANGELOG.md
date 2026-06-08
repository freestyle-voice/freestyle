# Changelog
## 0.1.7

### Bug Fixes 🐛

- Prevent multiple instances on Linux and persist autostart setting by @MathurAditya724 in [#210](https://github.com/freestyle-voice/freestyle/pull/210)
- Pill not showing on macOS and consecutive MLX transcription failures by @MathurAditya724 in [#209](https://github.com/freestyle-voice/freestyle/pull/209)
- Percent-encode x-app-context header to avoid fetch failure on non-Latin1 window titles by @vbp1 in [#208](https://github.com/freestyle-voice/freestyle/pull/208)
- Allow deleting inactive cleanup providers by @shikhargen in [#200](https://github.com/freestyle-voice/freestyle/pull/200)
- Improve paste handling on Linux for Wayland and X11 by @shikhargen in [#196](https://github.com/freestyle-voice/freestyle/pull/196)

### Internal Changes 🔧

- Add opencode agent skills for frontend, React, and shadcn by @MathurAditya724 in [#207](https://github.com/freestyle-voice/freestyle/pull/207)
- Remove subtitle from Vocabulary page header by @Agastya18 in [#197](https://github.com/freestyle-voice/freestyle/pull/197)

### Other

- replace raw fetch calls with typed getClient() RPC by @MathurAditya724 in [d00025d7](https://github.com/freestyle-voice/freestyle/commit/d00025d77b3a5a32ddd85824ed7c79e781a9e8a0)
- increase models.dev cache TTL from 10 min to 6 hours by @MathurAditya724 in [da42677f](https://github.com/freestyle-voice/freestyle/commit/da42677f543baaa9869bf3e26f2a15e9eeed6619)
- Delete package-lock.json by @MathurAditya724 in [8c9ee02f](https://github.com/freestyle-voice/freestyle/commit/8c9ee02f0b2167eac11c0b96a5f8c5f2451085a9)
- Completely refactor the models page. by @matteo8p in [#206](https://github.com/freestyle-voice/freestyle/pull/206)
- Refactor React components by @matteo8p in [#199](https://github.com/freestyle-voice/freestyle/pull/199)

## 0.1.6

### Bug Fixes 🐛

- Kill whisper-server and other child processes on app quit by @MathurAditya724 in [#193](https://github.com/freestyle-voice/freestyle/pull/193)
- Remove subtext on the models page by @MFA-G in [#185](https://github.com/freestyle-voice/freestyle/pull/185)
- Remove subtext on the settings page by @EvolutionX-10 in [#186](https://github.com/freestyle-voice/freestyle/pull/186)
- Navigate to settings page when clicking update notifications by @MathurAditya724 in [#177](https://github.com/freestyle-voice/freestyle/pull/177)

### Other

- Use `@huggingface/hub` to download MLX models by @matteo8p in [#190](https://github.com/freestyle-voice/freestyle/pull/190)
- Use Huggingface Hub for model downloads by @matteo8p in [#189](https://github.com/freestyle-voice/freestyle/pull/189)

## 0.1.5

- Electron paste issue by @matteo8p in [#175](https://github.com/freestyle-voice/freestyle/pull/175)

## 0.1.4

### New Features ✨

- Auto-update managed mlx worker by @tigerisaac in [#169](https://github.com/freestyle-voice/freestyle/pull/169)
- Add real progress tracking for MLX model weight downloads by @MathurAditya724 in [#161](https://github.com/freestyle-voice/freestyle/pull/161)

### Bug Fixes 🐛

- (ui) Models page polish by @shawnriju in [#163](https://github.com/freestyle-voice/freestyle/pull/163)
- Polish pill panning — drag cursor, bounds checking, custom position lifecycle by @MathurAditya724 in [#171](https://github.com/freestyle-voice/freestyle/pull/171)
- Gate tray setContextMenu to Linux only to preserve macOS click behavior by @MathurAditya724 in [#172](https://github.com/freestyle-voice/freestyle/pull/172)
- Linux issues - program can't be closed, processes still hanging by @kajalkattige30 in [#162](https://github.com/freestyle-voice/freestyle/pull/162)
- Wait for native key listener READY before confirming hotkey registration by @MathurAditya724 in [#167](https://github.com/freestyle-voice/freestyle/pull/167)

### Other

- Enhance 111: Adding panning to pill widget by @srirae in [#164](https://github.com/freestyle-voice/freestyle/pull/164)
- Fix hog transcribe capture by @matteo8p in [#170](https://github.com/freestyle-voice/freestyle/pull/170)
- Modify our onboarding flow. by @matteo8p in [#166](https://github.com/freestyle-voice/freestyle/pull/166)

## 0.1.3

### New Features ✨

- Validate API keys on save with per-provider health checks by @MathurAditya724 in [#159](https://github.com/freestyle-voice/freestyle/pull/159)

### Bug Fixes 🐛

- (macos) Use modern System Settings URL for microphone privacy pane by @MathurAditya724 in [#151](https://github.com/freestyle-voice/freestyle/pull/151)
- Update download button not triggering download or showing progress by @MathurAditya724 in [#157](https://github.com/freestyle-voice/freestyle/pull/157)
- Register Escape cancel shortcut on all platforms, not just Windows by @MathurAditya724 in [#155](https://github.com/freestyle-voice/freestyle/pull/155)
- Prevent MLX ASR worker unload while transcriptions are in flight by @MathurAditya724 in [#154](https://github.com/freestyle-voice/freestyle/pull/154)
- Add structured Winston logger and fix EPIPE crash on Linux AppImage by @MathurAditya724 in [#153](https://github.com/freestyle-voice/freestyle/pull/153)
- Remove onboarding skip, stop repeated update notifications, dynamic menu labels by @MathurAditya724 in [#150](https://github.com/freestyle-voice/freestyle/pull/150)

### Other

- Implement "Hard Reset" that completely resets Freestyle (Dev only) by @matteo8p in [#152](https://github.com/freestyle-voice/freestyle/pull/152)
- Fix transcription language in streaming path + macOS Accessibility prompt/URL by @BransTiong in [#149](https://github.com/freestyle-voice/freestyle/pull/149)

## 0.1.2

### New Features ✨

- Add output mode setting to copy instead of paste by @Olaiwonismail in [#141](https://github.com/freestyle-voice/freestyle/pull/141)

### Bug Fixes 🐛

- Address MLX streaming parallel-load follow-ups by @MathurAditya724 in [#146](https://github.com/freestyle-voice/freestyle/pull/146)

### Other

- MLX Streaming + Parallel loading by @tigerisaac in [#143](https://github.com/freestyle-voice/freestyle/pull/143)
- Add CI Status summary job to satisfy ruleset required check by @MathurAditya724 in [#145](https://github.com/freestyle-voice/freestyle/pull/145)

## 0.1.1

### Internal Changes 🔧

- Faster dashboard init and local fonts for both windows by @MathurAditya724 in [#134](https://github.com/freestyle-voice/freestyle/pull/134)
- Reduce pill initialization time on hotkey press by @MathurAditya724 in [#133](https://github.com/freestyle-voice/freestyle/pull/133)

### Other

- Fix hotkey binding by @tigerisaac in [#131](https://github.com/freestyle-voice/freestyle/pull/131)

## 0.1.0

### Bug Fixes 🐛

- Guard deferred startup tasks against missing FREESTYLE_DB_PATH by @MathurAditya724 in [#127](https://github.com/freestyle-voice/freestyle/pull/127)
- Cmake ENOENT on macOS when launched from Finder due to missing Homebrew PATH by @MathurAditya724 in [#125](https://github.com/freestyle-voice/freestyle/pull/125)
- Local Whisper model fails to start on Windows due to binary path mismatch by @MathurAditya724 in [#124](https://github.com/freestyle-voice/freestyle/pull/124)

### Internal Changes 🔧

- Parallelize mic acquisition and app context fetch to reduce pill initialization delay by @MathurAditya724 in [#121](https://github.com/freestyle-voice/freestyle/pull/121)

## 0.0.13

### Bug Fixes 🐛

- MLX onboarding selection bugs and local provider UI by @MathurAditya724 in [#116](https://github.com/freestyle-voice/freestyle/pull/116)
- Address review findings from vocabulary and streaming PRs by @MathurAditya724 in [#114](https://github.com/freestyle-voice/freestyle/pull/114)

### Internal Changes 🔧

- Add E2E tests for API server and Electron app by @MathurAditya724 in [#113](https://github.com/freestyle-voice/freestyle/pull/113)

### Other

- Add basic telemetry by @matteo8p in [#117](https://github.com/freestyle-voice/freestyle/pull/117)
- Freestyle desktop app UI opens by default all the time by @matteo8p in [#115](https://github.com/freestyle-voice/freestyle/pull/115)
- MLX local models with Qwen3 by @tigerisaac in [#112](https://github.com/freestyle-voice/freestyle/pull/112)
- ASR Vocabulary biasing and Streaming fixes by @tigerisaac in [#82](https://github.com/freestyle-voice/freestyle/pull/82)

## 0.0.12

### Bug Fixes 🐛

- Add Apple Events entitlement to fix paste on macOS by @MathurAditya724 in [#108](https://github.com/freestyle-voice/freestyle/pull/108)

## 0.0.11

### New Features ✨

- Add launch at startup setting and fix accessibility permission check by @MathurAditya724 in [#106](https://github.com/freestyle-voice/freestyle/pull/106)

### Other

- MIT license by @matteo8p in [#103](https://github.com/freestyle-voice/freestyle/pull/103)
- fixed Issue: 73 by @srirae in [#102](https://github.com/freestyle-voice/freestyle/pull/102)

## 0.0.10

### Bug Fixes 🐛

- Set app name to Freestyle in macOS menu bar by @MathurAditya724 in [#100](https://github.com/freestyle-voice/freestyle/pull/100)

### Other

- Changed settings window size by @kaito-undefined in [#93](https://github.com/freestyle-voice/freestyle/pull/93)

## 0.0.9

### New Features ✨

- Unify model picker cards by @shikhargen in [#96](https://github.com/freestyle-voice/freestyle/pull/96)

### Bug Fixes 🐛

- Update & restart button and download state tracking by @MathurAditya724 in [#98](https://github.com/freestyle-voice/freestyle/pull/98)
- Remove feedback feature (#52) by @Olaiwonismail in [#74](https://github.com/freestyle-voice/freestyle/pull/74)

## 0.0.8

### New Features ✨

- Implement full onboarding flow by @MathurAditya724 in [#87](https://github.com/freestyle-voice/freestyle/pull/87)
- Add local whisper.cpp voice model support by @MathurAditya724 in [#75](https://github.com/freestyle-voice/freestyle/pull/75)

### Bug Fixes 🐛

- Fallback to REST transcription when OpenAI Realtime API is unsupported by @udaykakade25 in [#92](https://github.com/freestyle-voice/freestyle/pull/92)
- Cleanup LLM model selection and provider handling by @shikhargen in [#86](https://github.com/freestyle-voice/freestyle/pull/86)
- Refactor UsageBar to stacked label/bar layout by @udaykakade25 in [#76](https://github.com/freestyle-voice/freestyle/pull/76)
- Make ui reponsive in all pages by @shikhargen in [#77](https://github.com/freestyle-voice/freestyle/pull/77)
- Resolve stacked pill content getting cut off by window bounds by @MathurAditya724 in [#72](https://github.com/freestyle-voice/freestyle/pull/72)

### Other

- Redesign model picker page (plus a couple other small things) by @matteo8p in [#91](https://github.com/freestyle-voice/freestyle/pull/91)
- Fix/hotkey rebinding by @tigerisaac in [#85](https://github.com/freestyle-voice/freestyle/pull/85)

## 0.0.7

### New Features ✨

- Replace shell-based hotkey, paste, and mic detection with native platform binaries by @MathurAditya724 in [#50](https://github.com/freestyle-voice/freestyle/pull/50)
- Unified transcription provider factory with streaming support by @MathurAditya724 in [#48](https://github.com/freestyle-voice/freestyle/pull/48)
- Improve post-processing and add re-record during transcription by @MathurAditya724 in [#47](https://github.com/freestyle-voice/freestyle/pull/47)

### Bug Fixes 🐛

- Remove redundant subtext from formats page by @Akshatshukla-25 in [#69](https://github.com/freestyle-voice/freestyle/pull/69)
- Streaming pipeline — process before sending, resolve immediately by @MathurAditya724 in [#68](https://github.com/freestyle-voice/freestyle/pull/68)
- Opaque sticky headers and click-outside on model dropdowns by @tigerisaac in [#64](https://github.com/freestyle-voice/freestyle/pull/64)
- Remove scrollbar from today page timeline by @srirae in [#62](https://github.com/freestyle-voice/freestyle/pull/62)
- Wire streaming WebSocket commit flow for real-time transcription by @MathurAditya724 in [#61](https://github.com/freestyle-voice/freestyle/pull/61)
- Rewrite ElevenLabs WebSocket streaming to match actual API spec by @MathurAditya724 in [#60](https://github.com/freestyle-voice/freestyle/pull/60)
- Implement proper Sentry instrumentation for errors, traces, and telemetry by @MathurAditya724 in [#57](https://github.com/freestyle-voice/freestyle/pull/57)

### Documentation 📚

- Replace 'open source' with 'source-available' in README by @MathurAditya724 in [#59](https://github.com/freestyle-voice/freestyle/pull/59)

### Other

- Remove design folder by @matteo8p in [#67](https://github.com/freestyle-voice/freestyle/pull/67)
- Update the models and settings page by @matteo8p in [#65](https://github.com/freestyle-voice/freestyle/pull/65)
- [UI] Dictionary and formats page redesign by @matteo8p in [#54](https://github.com/freestyle-voice/freestyle/pull/54)
- [UI] New history page design by @matteo8p in [#51](https://github.com/freestyle-voice/freestyle/pull/51)

## 0.0.6

### Bug Fixes 🐛

- Externalize ws optional deps (bufferutil, utf-8-validate) by @MathurAditya724 in [a883af45](https://github.com/freestyle-voice/freestyle/commit/a883af455a3dc534b99dbaa0ccff402b9b0ab77d)
- Improve responsive layout across Today, Formats, and History sections by @udaykakade25 in [#44](https://github.com/freestyle-voice/freestyle/pull/44)

### Other

- Update electron.vite.config.ts by @MathurAditya724 in [0f43572f](https://github.com/freestyle-voice/freestyle/commit/0f43572fdf155719cdbcd4ace654a23e1e2b7c32)

## 0.0.5

- Update electron.vite.config.ts by @MathurAditya724 in [9dbb47e4](https://github.com/freestyle-voice/freestyle/commit/9dbb47e41e20b5476f832984f0610fe0a46af14e)

## 0.0.4

### New Features ✨

- Add MCP endpoint for dict, formats, and history tools by @MathurAditya724 in [#41](https://github.com/freestyle-voice/freestyle/pull/41)
- Add Windows cloud-only support by @udaykakade25 in [#25](https://github.com/freestyle-voice/freestyle/pull/25)
- Add Sentry error tracking to Electron main and renderer processes by @MathurAditya724 in [#33](https://github.com/freestyle-voice/freestyle/pull/33)
- Background update checking, auto-update setting, pill theme fix, paste race condition fix by @MathurAditya724 in [#26](https://github.com/freestyle-voice/freestyle/pull/26)

### Bug Fixes 🐛

- First-run pill disappearing, idle-timeout mic release, LLM reasoning leak by @MathurAditya724 in [#40](https://github.com/freestyle-voice/freestyle/pull/40)
- Critical state bugs — streaming callbacks, audio node leaks, dev-only logging by @MathurAditya724 in [#36](https://github.com/freestyle-voice/freestyle/pull/36)
- Reduce event-loop contention and release mic between sessions by @MathurAditya724 in [#35](https://github.com/freestyle-voice/freestyle/pull/35)
- Reduce main-process event-loop pressure to prevent typing lag on macOS by @MathurAditya724 in [#34](https://github.com/freestyle-voice/freestyle/pull/34)
- Populate audio_duration_ms so recording duration and WPM are tracked by @MathurAditya724 in [#32](https://github.com/freestyle-voice/freestyle/pull/32)

### Other

- README P2 by @matteo8p in [#29](https://github.com/freestyle-voice/freestyle/pull/29)
- Update README.md and CONTRIBUTING.md by @matteo8p in [#28](https://github.com/freestyle-voice/freestyle/pull/28)
- New home page design by @matteo8p in [#23](https://github.com/freestyle-voice/freestyle/pull/23)

