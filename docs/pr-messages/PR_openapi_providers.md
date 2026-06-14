# OpenAPI-compatible providers and model-page configuration

**Branch:** `pr/openapi-providers`  
**Base:** `main`

## What this PR does

Adds support for the most commonly used OpenAPI-compatible providers (OpenRouter, Azure OpenAI, LiteLLM/Local, Together AI, Fireworks AI, and generic custom endpoints) directly in the Models page. Lesser-known providers are omitted to keep the picker approachable; users can still reach any other endpoint through the "Custom endpoint" preset.

## Files changed

### Server / API

- `apps/server/src/lib/openapi-compatible.ts` — OpenAPI-compatible request/response handling and endpoint normalization.
- `apps/server/src/lib/openrouter.ts` — OpenRouter-specific integration.
- `apps/server/src/lib/providers.ts` — Provider registry updates.
- `apps/server/src/lib/streaming/providers/openrouter.ts` — Streaming support for OpenRouter.
- `apps/server/src/lib/streaming/registry.ts` — Registry wiring.
- `apps/server/src/lib/validate-key.ts` — API-key validation updates.
- `apps/server/src/routes/models.ts` — `/available` now fetches models from the configured OpenAPI-compatible endpoint; `/settings/local-llm/test` validates the connection.
- `apps/server/src/routes/settings.ts` — Settings route updates.
- `apps/server/tests/openapi-compatible.test.ts`
- `apps/server/tests/openapi-compatible-route.test.ts`
- `apps/server/tests/openrouter.test.ts`

### Shared validations

- `packages/validations/src/index.ts`
- `packages/validations/src/openapi.ts` — Schemas for OpenAPI provider config, endpoint normalization, and the curated preset list.

### Electron renderer

- `apps/electron/src/renderer/src/components/model-row.tsx` — Row rendering for OpenAPI models.
- `apps/electron/src/renderer/src/pages/models/model-list.tsx` — Adds a prominent "Add a provider" shelf at the top of the LLM picker. The curated providers (OpenRouter, Azure OpenAI, LiteLLM / Local, Together AI, Fireworks AI, Custom endpoint) are shown as labeled cards with short descriptions. Clicking a card pre-fills the endpoint and reveals the key/model form.
- `apps/electron/src/renderer/src/pages/models/model-modal.tsx` — Modal wiring.
- `apps/electron/src/renderer/src/pages/models/use-models.ts` — State and test/apply logic for the local-llm connection.

## How it works

OpenAPI-compatible providers are **configured, not auto-discovered**. They appear in the UI after the user:

1. Opens the LLM model picker (Settings → Models → Cleanup model).
2. Selects an OpenAPI-compatible preset (e.g., OpenRouter) or types a custom `/v1` endpoint.
3. Enters an API key if required.
4. Clicks **Test**.
5. Selects a discovered model (or types one manually) and clicks **Apply**.

Once configured, the discovered models are listed as `local-llm` rows in the model picker.

## How to test

1. `pnpm typecheck` should pass.
2. Server unit tests should pass (`pnpm test` in `apps/server`).
3. Open the LLM model picker and confirm the "Add a provider" shelf is visible at the top with six cards.
4. Enter a valid OpenRouter API key, click Test, and confirm models are discovered.
5. Select a model and verify it is saved as the cleanup model.
6. Confirm that removed presets (Moonshot, DeepInfra, SambaNova, vLLM, raw localhost template) no longer appear in the shelf.

## Checklist

- [x] OpenAPI-compatible provider backend implemented.
- [x] OpenRouter provider implemented.
- [x] Model-page UI updated.
- [x] Validation schemas added.
- [x] Tests added.
