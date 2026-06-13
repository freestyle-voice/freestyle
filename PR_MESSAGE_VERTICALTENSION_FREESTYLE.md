# PR Message - VerticalTension Freestyle Customizations

## Title

Harden push-to-talk audio handling and expand OpenAPI-compatible provider support

## Summary

This change set applies a custom Freestyle implementation pass focused on
push-to-talk usability, background-audio suppression, and broader
OpenAPI-compatible model-provider support.

Compared with upstream `verticaltension/freestyle`, this branch:

- repairs and renames the active push-to-talk flow
- adds configurable background-audio ducking with full mute at `0%`
- adds macOS-aware ducking support in the shared main-process ducking layer
- removes the extra intermediary voice-model popup
- adds OpenRouter provider support
- expands the old local-LLM lane into a broader OpenAPI-compatible provider lane
- adds provider presets and endpoint normalization for hosted compatible vendors
- adds manual model or deployment entry for endpoints that do not expose
  shared `/models`
- shifts the accent and background presentation toward royal blue and dark
  graphite
- documents the implementation and delivery artifacts

## Main changes

### Push-to-talk and audio handling

- repaired the hold-to-record path
- replaced active `press to speak` wording with `push-to-talk`
- added a main-process audio ducking engine
- added full mute fallback for `0%` retained volume
- added a user-facing ducking slider in settings
- added restore safeguards so Freestyle does not blindly stomp over later
  external volume changes

### Voice-model flow

- removed the extra `How should Freestyle transcribe?` intermediary popup
- routed the experience straight into the real voice-model picker

### OpenRouter and OpenAPI-compatible providers

- added OpenRouter-specific helper logic and streaming registration
- added generic OpenAPI-compatible endpoint normalization
- added provider-aware auth headers and labels
- added presets for OpenRouter, Azure Template, LiteLLM Local, vLLM Local,
  Custom Local Template, Generic HTTPS Template, Moonshot, Together AI,
  Fireworks AI, DeepInfra, and SambaNova
- added manual model or deployment entry when `/models` discovery is not
  available

### UI and styling

- updated the accent styling toward royal blue
- updated the base background styling toward dark graphite grey

### Documentation

- added `README_OUR_MODIFICATIONS.md`
- added `FEATURE_REGISTRY_OUR_MODIFICATIONS.md`
- retained the implementation packet at
  `docs/openapi-compatible-and-push-to-talk-hardening-2026-06-12.md`

## Verification

- `pnpm --filter @freestyle/electron typecheck`
- `pnpm --filter @freestyle/server test`
- `pnpm exec biome check ...` on touched files during the implementation pass
- verified Windows installer build:
  - `C:\Users\Anthracite Ace\Downloads\Freestyle-0.1.8-setup.exe`

## Known caveats

- the Windows native packaging pass still logs a non-fatal
  `windows-mic-listener.exe` fallback condition
- the Windows packaging pass still logs a non-fatal missing
  `apps/electron/resources/whisper/win32-x64` resource warning

## Supporting docs

- `README_OUR_MODIFICATIONS.md`
- `FEATURE_REGISTRY_OUR_MODIFICATIONS.md`
- `docs/openapi-compatible-and-push-to-talk-hardening-2026-06-12.md`
