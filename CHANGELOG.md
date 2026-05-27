# Changelog
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

