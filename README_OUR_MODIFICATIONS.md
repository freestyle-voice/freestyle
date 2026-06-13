# Freestyle Our Modifications

This document records the custom Freestyle changes in this repo relative to the
upstream `verticaltension/freestyle` project.

## Comparison baseline

- Upstream repo cloned to: `/home/dev/src/verticaltension-freestyle-upstream`
- Upstream HEAD inspected on `2026-06-13`: `de6dcda`
- Upstream HEAD subject: `More robust language handling (#250)`
- Local merge-base with upstream main: `7ec6a5e`
- Local implementation branch is currently the upstream merge-base plus the
  custom changes documented below

## Why this document exists

The current repo is not just a straight mirror of upstream.
It contains user-requested product changes around:

- push-to-talk behavior and naming
- aggressive background-audio muting and ducking
- OpenRouter support
- broader OpenAPI-compatible provider support
- model-selection flow changes
- product theming and presentation updates
- local packaging and delivery artifacts

## High-level custom changes

### 1. Push-to-talk repair and rename

- Replaced active user-facing `press to speak` wording with `push-to-talk`
- Repaired the hold-to-record path
- Hardened native-listener compilation handling in the Electron native build path

Key files:

- `apps/electron/native/windows-mic-listener.c`
- `apps/electron/scripts/compile-native.js`
- `apps/electron/src/main/index.ts`
- `apps/electron/src/renderer/src/pages/app.tsx`

### 2. Background audio ducking and full mute

- Added a main-process audio ducking controller
- Added full mute behavior when the ducking slider is set to `0%`
- Added a user-adjustable retained-volume slider so users can choose between
  total mute and partial ducking
- Added the platform wiring needed for macOS support where available

Key files:

- `apps/electron/src/main/audio-ducking.ts`
- `apps/electron/src/main/index.ts`
- `apps/electron/src/preload/index.ts`
- `apps/electron/src/preload/index.d.ts`
- `apps/electron/src/renderer/src/pages/app.tsx`
- `apps/electron/src/renderer/src/pages/settings.tsx`

### 3. Voice-model flow simplification

- Removed the extra intermediary popup asking how Freestyle should transcribe
- Changed the flow so the app goes directly to the real voice-model picker

Key files:

- `apps/electron/src/renderer/src/pages/models/model-list.tsx`
- `apps/electron/src/renderer/src/pages/models/use-models.ts`

### 4. OpenRouter support

- Added OpenRouter-specific endpoint and provider wiring
- Added OpenRouter streaming-provider registration
- Added OpenRouter validation coverage

Key files:

- `apps/server/src/lib/openrouter.ts`
- `apps/server/src/lib/streaming/providers/openrouter.ts`
- `apps/server/src/lib/streaming/registry.ts`
- `apps/server/tests/openrouter.test.ts`

### 5. Broader OpenAPI-compatible provider support

- Expanded the old local-LLM lane into a practical OpenAPI-compatible lane
- Added endpoint normalization for `/v1`, `/responses`, `/chat/completions`,
  and `/v1/openai`
- Added provider presets for OpenRouter, Azure, LiteLLM, vLLM, Together,
  Fireworks, DeepInfra, SambaNova, Moonshot, and generic hosted/local templates
- Added manual model or deployment entry when shared `/models` discovery is not
  available

Key files:

- `packages/validations/src/openapi.ts`
- `packages/validations/src/index.ts`
- `apps/server/src/lib/openapi-compatible.ts`
- `apps/server/src/lib/providers.ts`
- `apps/server/src/lib/validate-key.ts`
- `apps/server/src/routes/models.ts`
- `apps/server/src/routes/settings.ts`
- `apps/electron/src/renderer/src/lib/models.ts`
- `apps/electron/src/renderer/src/pages/models/model-list.tsx`
- `apps/electron/src/renderer/src/pages/models/use-models.ts`
- `apps/server/tests/openapi-compatible.test.ts`
- `apps/server/tests/openapi-compatible-route.test.ts`

### 6. Theme customization

- Changed the main accent away from green to a royal-blue direction
- Moved the general background toward a darker graphite-grey presentation

Key files:

- `apps/electron/src/renderer/src/globals.css`
- `apps/electron/src/renderer/src/components/model-row.tsx`

### 7. Documentation and delivery artifacts

- Added a dedicated implementation packet documenting the OpenAPI-compatible and
  push-to-talk hardening pass
- Built and verified a fresh Windows installer
- Copied repo delivery artifacts to the Windows Downloads folder and to VPS M

Key files:

- `docs/openapi-compatible-and-push-to-talk-hardening-2026-06-12.md`

## Exact tracked code delta vs upstream merge-base

Files changed in the implementation delta:

- `apps/electron/native/windows-mic-listener.c`
- `apps/electron/scripts/compile-native.js`
- `apps/electron/src/main/audio-ducking.ts`
- `apps/electron/src/main/index.ts`
- `apps/electron/src/preload/index.d.ts`
- `apps/electron/src/preload/index.ts`
- `apps/electron/src/renderer/src/components/model-row.tsx`
- `apps/electron/src/renderer/src/globals.css`
- `apps/electron/src/renderer/src/lib/models.ts`
- `apps/electron/src/renderer/src/pages/app.tsx`
- `apps/electron/src/renderer/src/pages/models/model-list.tsx`
- `apps/electron/src/renderer/src/pages/models/use-models.ts`
- `apps/electron/src/renderer/src/pages/settings.tsx`
- `apps/server/src/lib/openapi-compatible.ts`
- `apps/server/src/lib/openrouter.ts`
- `apps/server/src/lib/providers.ts`
- `apps/server/src/lib/streaming/providers/openrouter.ts`
- `apps/server/src/lib/streaming/registry.ts`
- `apps/server/src/lib/validate-key.ts`
- `apps/server/src/routes/models.ts`
- `apps/server/src/routes/settings.ts`
- `apps/server/tests/openapi-compatible-route.test.ts`
- `apps/server/tests/openapi-compatible.test.ts`
- `apps/server/tests/openrouter.test.ts`
- `docs/openapi-compatible-and-push-to-talk-hardening-2026-06-12.md`
- `packages/validations/src/index.ts`
- `packages/validations/src/openapi.ts`

## Validation summary

Implementation validation already recorded in the implementation packet:

- `pnpm --filter @freestyle/electron typecheck`
- `pnpm --filter @freestyle/server test`
- `pnpm exec biome check ...` on touched files

Server-side test result recorded during the implementation pass:

- `90 passed`

## Known follow-ups

- The Windows build still logs a non-fatal `windows-mic-listener.exe` fallback
  condition during native compilation.
- The Windows build still logs a non-fatal missing
  `apps/electron/resources/whisper/win32-x64` packaging warning.
- Upstream `verticaltension/freestyle` has advanced to `de6dcda`, so future
  upstream PR work should re-check whether that newer upstream language-handling
  work intersects with any local customizations.
