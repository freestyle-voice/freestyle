# Changelog
## 0.5.1

### New Features ✨

#### Plugins

- Fetch catalog from cloud with static fallback by @MathurAditya724 in [#464](https://github.com/freestyle-voice/freestyle/pull/464)
- Show plugin UI pages as sidebar nav items by @MathurAditya724 in [#463](https://github.com/freestyle-voice/freestyle/pull/463)

#### Other

- (server) Deepgram AI SDK provider + Freestyle Cloud connection prewarm by @MathurAditya724 in [#460](https://github.com/freestyle-voice/freestyle/pull/460)
- Extract shared @freestyle-voice/stt package and migrate apps/server by @MathurAditya724 in [#446](https://github.com/freestyle-voice/freestyle/pull/446)

### Bug Fixes 🐛

- (settings) Reorder pill position options top-first by @MathurAditya724 in [#454](https://github.com/freestyle-voice/freestyle/pull/454)
- Update cloud plugins endpoint URL by @MathurAditya724 in [#465](https://github.com/freestyle-voice/freestyle/pull/465)
- MacOS Fn/paste hotkey desync and local server error logging by @MathurAditya724 in [#457](https://github.com/freestyle-voice/freestyle/pull/457)

### Internal Changes 🔧

#### Electron

- Defer AI SDK loading and non-critical boot work by @MathurAditya724 in [#453](https://github.com/freestyle-voice/freestyle/pull/453)
- Add bundle analysis and lazy-load i18n locales by @MathurAditya724 in [#451](https://github.com/freestyle-voice/freestyle/pull/451)

#### Server

- Unify cloud model adapters behind provider registries by @MathurAditya724 in [#459](https://github.com/freestyle-voice/freestyle/pull/459)
- Lazy-load local ASR servers with on-demand pre-warm by @MathurAditya724 in [#456](https://github.com/freestyle-voice/freestyle/pull/456)

#### Other

- (cloud-usage) Manual refresh instead of per-transcription refetch by @MathurAditya724 in [#458](https://github.com/freestyle-voice/freestyle/pull/458)
- Enforce conventional commit PR titles by @MathurAditya724 in [#450](https://github.com/freestyle-voice/freestyle/pull/450)

## 0.5.0

### New Features ✨

- Auto-delete transcription history after a configurable period by @dchaudhari7177 in [#424](https://github.com/freestyle-voice/freestyle/pull/424)

### Other

- Add trailing white space to paste. by @matteo8p in [#445](https://github.com/freestyle-voice/freestyle/pull/445)

## 0.4.5

### Bug Fixes 🐛

- (history) Disable reset on defaults and clear filter panel bg by @MathurAditya724 in [#440](https://github.com/freestyle-voice/freestyle/pull/440)
- (models) Remove non-interactive On-device row from API keys section by @MathurAditya724 in [#442](https://github.com/freestyle-voice/freestyle/pull/442)

### Other

- release: 0.1.1 by @MathurAditya724 in [4957a23c](https://github.com/freestyle-voice/freestyle/commit/4957a23cc7a230ae3dd1d67bf7aa152a87930e79)
- release: 0.4.4 by @MathurAditya724 in [0c2a364e](https://github.com/freestyle-voice/freestyle/commit/0c2a364ef8aba21c3d8b37fe2f37cccac35f7313)

## 0.4.4

### New Features ✨

- (history) Persist filters and add global view toggles by @MathurAditya724 in [#435](https://github.com/freestyle-voice/freestyle/pull/435)
- Diff mode for AI-edited history entries by @dchaudhari7177 in [#425](https://github.com/freestyle-voice/freestyle/pull/425)
- Send custom vocabulary to cloud v2 transcribe by @MathurAditya724 in [#428](https://github.com/freestyle-voice/freestyle/pull/428)
- Add "Always on" option to MLX model warming (never unload) by @Maheidem in [#407](https://github.com/freestyle-voice/freestyle/pull/407)

### Bug Fixes 🐛

- (ui) Match filter button height with searchbar in history page by @dchaudhari7177 in [#423](https://github.com/freestyle-voice/freestyle/pull/423)

### Other

- Harden API validation and tighten renderer performance by @MathurAditya724 in [#436](https://github.com/freestyle-voice/freestyle/pull/436)
- Replace history filter drawer with the inline filter panel by @tulsianigatik07-tech in [#426](https://github.com/freestyle-voice/freestyle/pull/426)
- Add softer tone sound by @matteo8p in [#433](https://github.com/freestyle-voice/freestyle/pull/433)
- Fix/model page rework by @tigerisaac in [#431](https://github.com/freestyle-voice/freestyle/pull/431)
- Remove asr biasing from the settings page. Modify the onboarding page by @matteo8p in [#432](https://github.com/freestyle-voice/freestyle/pull/432)
- Change sidebar color and the scrolling of the right card by @matteo8p in [#430](https://github.com/freestyle-voice/freestyle/pull/430)
- Shortened roadmap by @matteo8p in [#429](https://github.com/freestyle-voice/freestyle/pull/429)
- Remove extra bottom spacing on the settings page by @tulsianigatik07-tech in [#422](https://github.com/freestyle-voice/freestyle/pull/422)
- Restore independent Freestyle Cloud transcription and cleanup by @MathurAditya724 in [#427](https://github.com/freestyle-voice/freestyle/pull/427)
- Enable Tone panel and switch cloud transcribe to v2 by @MathurAditya724 in [#416](https://github.com/freestyle-voice/freestyle/pull/416)
- Users of an old Qwen3-ASR version must update to the newest one upon use. by @matteo8p in [#414](https://github.com/freestyle-voice/freestyle/pull/414)

## 0.4.3

### Bug Fixes 🐛

- (electron) Normalize transcription pill bars to the voice band by @AyushSrivastava1818 in [#376](https://github.com/freestyle-voice/freestyle/pull/376)
- Pin transformers to <5.13 in mlx-asr worker build by @Maheidem in [#404](https://github.com/freestyle-voice/freestyle/pull/404)

### Other

- Remove MCP endpoint by @matteo8p in [#412](https://github.com/freestyle-voice/freestyle/pull/412)
- Simplify the transcription logic on the front end (v3) by @matteo8p in [#411](https://github.com/freestyle-voice/freestyle/pull/411)
- Remove streaming capacity by @matteo8p in [#410](https://github.com/freestyle-voice/freestyle/pull/410)
- NORMALIZE UI LABEL TYPOGRAPHY by @tulsianigatik07-tech in [#409](https://github.com/freestyle-voice/freestyle/pull/409)
- Feat/tone page rework by @tigerisaac in [#408](https://github.com/freestyle-voice/freestyle/pull/408)
- Add directories to tsconfig. by @matteo8p in [#406](https://github.com/freestyle-voice/freestyle/pull/406)

## 0.4.2

### Bug Fixes 🐛

- (stt) Send vocabulary bias to Freestyle Cloud streaming by @tigerisaac in [#398](https://github.com/freestyle-voice/freestyle/pull/398)
- Compound hotkey suppression blocks dictation activation by @MathurAditya724 in [#396](https://github.com/freestyle-voice/freestyle/pull/396)

### Internal Changes 🔧

- (onboarding) Use provider-neutral sign-in icon and primary button by @MathurAditya724 in [#395](https://github.com/freestyle-voice/freestyle/pull/395)

### Other

- Fix High/Med cleanup prompts to be more consistent by @tigerisaac in [#397](https://github.com/freestyle-voice/freestyle/pull/397)

## 0.4.1

### Bug Fixes 🐛

- (server) Retry stale-socket resets on Freestyle Cloud calls by @MathurAditya724 in [#392](https://github.com/freestyle-voice/freestyle/pull/392)
- Handle rejected initial update check to avoid false crash reports by @MathurAditya724 in [#393](https://github.com/freestyle-voice/freestyle/pull/393)

## 0.4.0

### New Features ✨

- (server) Migrate cloud transcription to v2 (batch + streaming) by @MathurAditya724 in [#387](https://github.com/freestyle-voice/freestyle/pull/387)
- Enterprise proxy and custom CA support for model downloads by @MathurAditya724 in [#388](https://github.com/freestyle-voice/freestyle/pull/388)

### Bug Fixes 🐛

- (ci) Keep package releases out of GitHub "Latest" so app auto-update works by @MathurAditya724 in [#381](https://github.com/freestyle-voice/freestyle/pull/381)
- Consolidate two LLM settings queries into one (#255) by @Olaiwonismail in [#389](https://github.com/freestyle-voice/freestyle/pull/389)

### Documentation 📚

- Document voice-commands plugin and new SDK capabilities by @MathurAditya724 in [c4bb3e32](https://github.com/freestyle-voice/freestyle/commit/c4bb3e32738412d04204f41f1d837e515e13c451)

### Internal Changes 🔧

- (server) Tighten local LLM settings types and reuse timeout constant by @MathurAditya724 in [#390](https://github.com/freestyle-voice/freestyle/pull/390)

### Other

- Phase 2 of some stability cleanups by @matteo8p in [#386](https://github.com/freestyle-voice/freestyle/pull/386)
- Phase 1 prs for stability improvements by @matteo8p in [#384](https://github.com/freestyle-voice/freestyle/pull/384)
- Include app stability specs by @matteo8p in [#383](https://github.com/freestyle-voice/freestyle/pull/383)

## 0.3.4

### New Features ✨

- Add docs site to monorepo at apps/docs by @MathurAditya724 in [#374](https://github.com/freestyle-voice/freestyle/pull/374)

### Bug Fixes 🐛

- (electron) Improve light mode macOS glass readability by @siddharthkul in [#378](https://github.com/freestyle-voice/freestyle/pull/378)
- Support pnpm 11 electron installs by @tigerisaac in [#377](https://github.com/freestyle-voice/freestyle/pull/377)

### Documentation 📚

- Add Features section and plugin dev link workflow by @MathurAditya724 in [#375](https://github.com/freestyle-voice/freestyle/pull/375)

## 0.3.3

### New Features ✨

- Add plugin update system with version checking and one-click updates by @MathurAditya724 in [#355](https://github.com/freestyle-voice/freestyle/pull/355)

## 0.3.2

### Bug Fixes 🐛

- (ui) Use popper positioning for select dropdowns by @MathurAditya724 in [#343](https://github.com/freestyle-voice/freestyle/pull/343)
- Show voice pill on the monitor under the cursor by @MathurAditya724 in [#349](https://github.com/freestyle-voice/freestyle/pull/349)
- Collapse spurious line breaks from local ASR transcripts by @MathurAditya724 in [#348](https://github.com/freestyle-voice/freestyle/pull/348)
- Make plugin protocol/IPC registration and DB init idempotent by @MathurAditya724 in [#347](https://github.com/freestyle-voice/freestyle/pull/347)
- Correct macos hotkey suppression matching by @tigerisaac in [#346](https://github.com/freestyle-voice/freestyle/pull/346)
- Keep source language during cleanup in auto-detect mode by @MathurAditya724 in [#345](https://github.com/freestyle-voice/freestyle/pull/345)
- Stop whisper server before deleting model file by @MathurAditya724 in [#344](https://github.com/freestyle-voice/freestyle/pull/344)

### Other

- [Clean up] Remove custom server URLs from settings by @matteo8p in [#342](https://github.com/freestyle-voice/freestyle/pull/342)
- package back to 0.0.0 by @matteo8p in [#339](https://github.com/freestyle-voice/freestyle/pull/339)
- [Plugin] Profanity filter plugin by @matteo8p in [#338](https://github.com/freestyle-voice/freestyle/pull/338)

## 0.3.1

### New Features ✨

- Add cloud usage display to sidebar and today page by @MathurAditya724 in [#335](https://github.com/freestyle-voice/freestyle/pull/335)

### Bug Fixes 🐛

- Provider logo visibility on selected filter pill and reduce pill left padding by @MathurAditya724 in [ed970d4a](https://github.com/freestyle-voice/freestyle/commit/ed970d4a1eb2f7a2491dd741b70eff3de35bc7af)

## 0.3.0

### New Features ✨

- Add plugin middleware support with built-in auth and cloud-sync plugins by @MathurAditya724 in [#329](https://github.com/freestyle-voice/freestyle/pull/329)
- Sync cleanup preferences to Freestyle Cloud by @MathurAditya724 in [#328](https://github.com/freestyle-voice/freestyle/pull/328)

### Other

- [Fix] Register all privileged schemes in one call by @matteo8p in [#331](https://github.com/freestyle-voice/freestyle/pull/331)
- Ignore npm format warnings by @matteo8p in [#330](https://github.com/freestyle-voice/freestyle/pull/330)

## 0.2.1

### New Features ✨

- Configurable post-processing intensity (Low/Medium/High/Custom) by @MathurAditya724 in [#301](https://github.com/freestyle-voice/freestyle/pull/301)
- Run the server standalone (Docker) and connect the app to it by @MathurAditya724 in [#297](https://github.com/freestyle-voice/freestyle/pull/297)

### Bug Fixes 🐛

- Minor changes in server routes by @MathurAditya724 in [2ef92aa2](https://github.com/freestyle-voice/freestyle/commit/2ef92aa281f225882b566b07327b458072a9cf94)

### Internal Changes 🔧

- (ui) Unify on shadcn components by @MathurAditya724 in [#298](https://github.com/freestyle-voice/freestyle/pull/298)

### Other

- Clearer Settings page by @tigerisaac in [#288](https://github.com/freestyle-voice/freestyle/pull/288)
- Fix Linux whisper-server AVX-512 crash by @andrewjsalzer in [#296](https://github.com/freestyle-voice/freestyle/pull/296)
- Add Groq Whisper Large v3 to the voice model catalog. by @tigerisaac in [#299](https://github.com/freestyle-voice/freestyle/pull/299)

## 0.2.0

### New Features ✨

- Volume pausing and/or ducking on recording by @MaxBtrn in [#226](https://github.com/freestyle-voice/freestyle/pull/226)

### Bug Fixes 🐛

#### Linux

- Use persistent uinput helper for Wayland paste by @xikhar in [#268](https://github.com/freestyle-voice/freestyle/pull/268)
- Show app icon in GNOME launcher and dock by @andrewjsalzer in [#246](https://github.com/freestyle-voice/freestyle/pull/246)

#### Other

- Move toLowerCase() outside loop in formats match endpoint by @kev0-4 in [#267](https://github.com/freestyle-voice/freestyle/pull/267)
- Detect terminal focus for Linux paste on Wayland by @andrewjsalzer in [#218](https://github.com/freestyle-voice/freestyle/pull/218)

### Internal Changes 🔧

- Centralize settings key in a single file by @MaxBtrn in [#278](https://github.com/freestyle-voice/freestyle/pull/278)
- Add vocabulary-bias unit tests and vocabulary API coverage by @anish808 in [#228](https://github.com/freestyle-voice/freestyle/pull/228)

### Other

- Fix onboarding flow and add the help page. by @matteo8p in [#286](https://github.com/freestyle-voice/freestyle/pull/286)
- pnpm format by @matteo8p in [#285](https://github.com/freestyle-voice/freestyle/pull/285)
- format' by @matteo8p in [fd977874](https://github.com/freestyle-voice/freestyle/commit/fd977874fa0490899b991e9a5c00872cdaa2d308)
- Qwen Partial Streaming removal by @tigerisaac in [#260](https://github.com/freestyle-voice/freestyle/pull/260)
- Fix pnpm format by @matteo8p in [#284](https://github.com/freestyle-voice/freestyle/pull/284)
- Enhance: Added new languages for i18n localization by @srirae in [#244](https://github.com/freestyle-voice/freestyle/pull/244)
- New buttons and formatting by @matteo8p in [#265](https://github.com/freestyle-voice/freestyle/pull/265)
- Add Soniox realtime STT with upgraded LLM processing pipeline by @tigerisaac in [#240](https://github.com/freestyle-voice/freestyle/pull/240)
- Fix toggle-mode hotkey spam pill UI bugs by @andrewjsalzer in [#248](https://github.com/freestyle-voice/freestyle/pull/248)
- More robust language handling by @matteo8p in [#250](https://github.com/freestyle-voice/freestyle/pull/250)
- Add SenseVoice Small as a Local MLX ASR model by @LauraGPT in [#236](https://github.com/freestyle-voice/freestyle/pull/236)
- readme by @matteo8p in [#241](https://github.com/freestyle-voice/freestyle/pull/241)
- content machine by @matteo8p in [c56396fb](https://github.com/freestyle-voice/freestyle/commit/c56396fbe719851e5c500228fdebe710ada64cb7)

## 0.1.8

### Bug Fixes 🐛

- Restore hotkey after ESC cancels dictation (#232) by @anish808 in [#233](https://github.com/freestyle-voice/freestyle/pull/233)
- Use platform-appropriate device copy on Linux and Windows by @andrewjsalzer in [#217](https://github.com/freestyle-voice/freestyle/pull/217)

### Other

- Update platform default push-to-talk hotkeys by @tigerisaac in [#230](https://github.com/freestyle-voice/freestyle/pull/230)
- Cross platform stability fixes by @matteo8p in [#227](https://github.com/freestyle-voice/freestyle/pull/227)
- cross platform audit by @matteo8p in [#225](https://github.com/freestyle-voice/freestyle/pull/225)
- onboarding funnel by @matteo8p in [f9fc6912](https://github.com/freestyle-voice/freestyle/commit/f9fc6912d31cf9c26318ea5ca4135d6012ff545a)
- Implement opiniated method to choosing models. by @matteo8p in [#224](https://github.com/freestyle-voice/freestyle/pull/224)
- Transcription optimize 2 by @matteo8p in [#223](https://github.com/freestyle-voice/freestyle/pull/223)
- Optimize transcribe first pass by @matteo8p in [#222](https://github.com/freestyle-voice/freestyle/pull/222)
- Transcribe stability improvements by @matteo8p in [#221](https://github.com/freestyle-voice/freestyle/pull/221)
- Feat/history filter panel by @shawnriju in [#211](https://github.com/freestyle-voice/freestyle/pull/211)
- Refactor React components by @matteo8p in [#199](https://github.com/freestyle-voice/freestyle/pull/199)

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

