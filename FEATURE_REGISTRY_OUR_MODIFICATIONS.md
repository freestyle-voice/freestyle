# Feature Registry Our Modifications

This registry captures the custom feature delta currently carried in this repo
relative to upstream `verticaltension/freestyle`.

## Baseline

- Upstream repo: `verticaltension/freestyle`
- Upstream inspected HEAD: `de6dcda`
- Local merge-base: `7ec6a5e`

## Registry

| ID | Area | Status | User-facing effect | Key files | Verification |
| --- | --- | --- | --- | --- | --- |
| PTT-001 | Push-to-talk naming | implemented | Active terminology is `push-to-talk` instead of `press to speak` | `apps/electron/src/renderer/src/pages/app.tsx`, `apps/electron/src/renderer/src/pages/settings.tsx` | Manual implementation pass plus Windows build |
| PTT-002 | Push-to-talk hold behavior | implemented | Hold-to-record path works again | `apps/electron/native/windows-mic-listener.c`, `apps/electron/src/main/index.ts`, `apps/electron/src/renderer/src/pages/app.tsx` | User validation reported it working before the audio hardening pass |
| AUD-001 | Main-process audio ducking engine | implemented | Background audio is ducked or muted while the mic is active | `apps/electron/src/main/audio-ducking.ts`, `apps/electron/src/main/index.ts`, `apps/electron/src/preload/index.ts` | Windows build completed with these files included |
| AUD-002 | Configurable ducking slider | implemented | Users can choose a retained background-audio level | `apps/electron/src/renderer/src/pages/settings.tsx`, `apps/electron/src/preload/index.d.ts` | Implementation packet documents slider behavior |
| AUD-003 | Full mute at zero percent | implemented | `0%` means total mute to avoid false input bleed | `apps/electron/src/main/audio-ducking.ts`, `apps/electron/src/renderer/src/pages/settings.tsx` | Requested behavior implemented and documented |
| AUD-004 | macOS ducking path | implemented where possible | macOS receives platform-specific ducking support when the OS lane allows it | `apps/electron/src/main/audio-ducking.ts` | Implemented in the shared audio-ducking layer |
| UX-001 | Voice-model popup removal | implemented | The app skips the extra transcribe-mode popup and goes straight to model selection | `apps/electron/src/renderer/src/pages/models/model-list.tsx`, `apps/electron/src/renderer/src/pages/models/use-models.ts` | Documented in implementation packet |
| UI-001 | Royal-blue accent and graphite theme | implemented | App presentation is shifted away from green toward royal blue and dark graphite | `apps/electron/src/renderer/src/globals.css`, `apps/electron/src/renderer/src/components/model-row.tsx` | Included in renderer diff and Windows build |
| UI-002 | Royal-blue icon and logo assets | implemented | The packaged app icon and shared Freestyle logo assets now use royal blue instead of green | `apps/electron/build/icon.icns`, `apps/electron/build/icon.ico`, `apps/electron/build/icon.png`, `apps/electron/resources/icon.png`, `media/freestyle-logo-full-dark.png`, `media/freestyle-logo-full-light.png`, `media/freestyle-logo-square.png` | Recolored and regenerated from the canonical icon source during the Windows packaging pass |
| OAR-001 | OpenRouter endpoint support | implemented | OpenRouter can be configured as a supported provider | `apps/server/src/lib/openrouter.ts`, `apps/server/src/lib/streaming/providers/openrouter.ts`, `apps/server/src/lib/streaming/registry.ts` | `apps/server/tests/openrouter.test.ts` |
| OAC-001 | Generic OpenAPI-compatible lane | implemented | Freestyle now supports hosted and local OpenAI-compatible providers beyond a localhost-only form | `packages/validations/src/openapi.ts`, `apps/server/src/lib/openapi-compatible.ts`, `apps/server/src/routes/settings.ts` | `apps/server/tests/openapi-compatible.test.ts` |
| OAC-002 | Provider presets | implemented | Presets exist for OpenRouter, Azure, LiteLLM, vLLM, Together, Fireworks, DeepInfra, SambaNova, Moonshot, and generic templates | `packages/validations/src/openapi.ts`, `apps/electron/src/renderer/src/pages/models/model-list.tsx` | Preset coverage included in server-side tests and docs |
| OAC-003 | Endpoint normalization | implemented | Compatible endpoints accept `/v1`, `/responses`, `/chat/completions`, and `/v1/openai` forms | `packages/validations/src/openapi.ts` | `apps/server/tests/openapi-compatible.test.ts` |
| OAC-004 | Manual model or deployment entry | implemented | Users can proceed even when `/models` discovery is absent or partial | `apps/server/src/routes/settings.ts`, `apps/server/src/routes/models.ts`, `apps/electron/src/renderer/src/pages/models/use-models.ts` | `apps/server/tests/openapi-compatible-route.test.ts` |
| OAC-005 | Provider-aware auth and labeling | implemented | Azure, OpenRouter, and other compatible providers get better headers and labels | `apps/server/src/lib/openapi-compatible.ts`, `apps/server/src/lib/validate-key.ts`, `apps/server/src/lib/providers.ts` | Covered by validation tests and implementation packet |
| OPS-001 | Windows installer rebuild | completed | A fresh installer was built and verified in the Windows Downloads folder | `docs/openapi-compatible-and-push-to-talk-hardening-2026-06-12.md` | Verified `Freestyle-0.1.8-setup.exe` timestamp and size |
| OPS-002 | Repo delivery artifacts | completed | Repo archive and handoff materials were copied to Windows Downloads and VPS M | `docs/openapi-compatible-and-push-to-talk-hardening-2026-06-12.md` | Delivery paths verified during packaging pass |

## Current caveats

- `windows-mic-listener.exe` still has a non-fatal native compile fallback in the
  Windows packaging lane.
- `apps/electron/resources/whisper/win32-x64` is still reported missing during
  the Windows packaging pass, although installer generation still completed.
