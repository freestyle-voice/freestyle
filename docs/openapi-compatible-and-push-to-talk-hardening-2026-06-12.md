# Freestyle OpenAPI-Compatible And Push-To-Talk Hardening

Date: `2026-06-12`
Status: implemented, validated locally, rebuilt on Windows, delivered to Downloads, repo bundle uploaded to VPS M
App version: `0.1.8`

## Purpose

This packet documents the current Freestyle implementation pass that combined:

- push-to-talk naming and behavior repair
- aggressive background-audio muting/ducking hardening
- removal of the extra voice-model intermediary popup
- OpenRouter voice endpoint integration
- broader OpenAPI-compatible cleanup-model endpoint support inspired by the local OpenPets repo
- packaging/distribution notes for the Windows host and VPS backup lane

It exists so later work does not have to reconstruct:

- which OpenAPI-compatible providers are actually implemented
- where model discovery still varies by provider
- why manual model/deployment entry was added
- what changed in the push-to-talk and audio-control lane
- which files now carry the main logic

## User-facing outcomes

### 1. Push-to-talk

- The app terminology is now `push-to-talk`.
- The key-hold path works again.
- The previous “press to speak” wording has been replaced in the active user-facing flow.

### 2. Background audio handling

- Push-to-talk can now fully mute background audio while the mic is active.
- A user-facing slider now controls the retained background-audio level.
- `0%` means full mute.
- Higher values allow partial ducking instead of total mute.
- The Windows volume restore path was hardened to better recover even if the source app changes volume while Freestyle is active.
- Mac-side audio ducking support was added where the platform lane makes it possible.

### 3. Voice-model picker flow

- The extra “How should Freestyle transcribe?” intermediary step from the newer upstream update has been removed from the active flow.
- The voice-model window now goes straight to the real `All voice models` view.

### 4. OpenAPI-compatible cleanup-model lane

- The old “Local LLM” lane has effectively become a generic `OpenAPI Compatible` connector.
- It now covers local gateways and hosted OpenAI-compatible providers instead of only localhost-style usage.
- Provider-aware UI hints now exist for the main compatible presets.
- Freestyle no longer treats these models as if they were always “on-device”.

## OpenAPI-compatible provider support

## Presets currently implemented

Freestyle now includes these endpoint presets/templates in the OpenAPI-compatible lane:

- `OpenRouter`
- `Azure Template`
- `LiteLLM Local`
- `vLLM Local`
- `Custom Local Template`
- `Generic HTTPS Template`
- `Moonshot (Kimi)`
- `Together AI`
- `Fireworks AI`
- `DeepInfra`
- `SambaNova`

## Why OpenAI was not added as a duplicate preset here

Freestyle already has a native first-party `OpenAI` provider lane for cleanup and voice features.
Because of that, an additional OpenAPI-compatible `OpenAI` preset was not added by default in this pass.
The compatible lane is focused on non-native OpenAI-compatible providers, proxies, and gateways.

If desired later, a duplicate OpenAI preset can still be added for symmetry, but it is not required for actual functionality.

## Endpoint normalization rules

The OpenAPI-compatible validator now accepts:

- bases ending in `/v1`
- full `.../responses` URLs
- full `.../chat/completions` URLs
- providers that use a compatible base under `/v1/openai`

Normalization behavior:

- `.../responses` becomes its corresponding base
- `.../chat/completions` becomes its corresponding base
- plain `http` is allowed only for localhost-style hosts
- remote hosts must use `https`

Examples now accepted:

- `https://openrouter.ai/api/v1`
- `https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1`
- `http://localhost:4000/v1`
- `https://api.deepinfra.com/v1/openai`
- `https://api.deepinfra.com/v1/openai/chat/completions`

## Provider-aware behavior

### Header behavior

The OpenAPI-compatible server helper now builds headers per provider family:

- OpenRouter:
  - uses the OpenRouter-specific header helper
- Azure OpenAI:
  - sends both `Authorization: Bearer ...` and `api-key: ...`
- generic compatible providers and gateways:
  - send bearer auth and `x-api-key` when appropriate

### Provider labeling

Freestyle now labels compatible endpoints more accurately instead of flattening them all into one generic/local bucket.

Recognized labels now include:

- `OpenRouter`
- `Azure OpenAI`
- `Moonshot`
- `Together AI`
- `Fireworks AI`
- `DeepInfra`
- `SambaNova`
- `Local OpenAPI`
- fallback `OpenAPI Compatible`

## Model discovery hardening

## Problem addressed

Some compatible providers work for actual model calls but do not behave nicely on shared `/models` discovery.
This is especially common with:

- Azure deployment-style setups
- some gateways/proxies
- some hosted compatible providers
- private or partial OpenAI-compatible surfaces

Before this pass, Freestyle treated failed `/models` discovery as if the provider was not usable at all.

## New behavior

The setup route now distinguishes between:

- endpoint totally invalid or unreachable
- endpoint reachable but not exposing shared `/models`

For compatible discovery failures such as:

- `400`
- `404`
- `405`
- `422`
- `501`

Freestyle now returns a successful connection result with:

- `model_discovery: "manual"`
- an explanatory hint
- an empty discovered-model list

That allows the user to proceed by entering a model name or deployment name manually.

## Manual model/deployment entry

The renderer now exposes a manual model input for the compatible lane.

This supports cases like:

- Azure deployment names
- OpenRouter model IDs entered directly
- DeepInfra model IDs
- custom proxy or gateway model names
- any compatible endpoint that accepts chat/completion calls without sharing a stable `/models` catalog

The user can now:

1. Save/test the compatible endpoint
2. Enter the model or deployment name manually
3. Commit that name as the cleanup model

This closes the earlier gap where a working compatible provider could still be unusable in Freestyle because discovery failed first.

## OpenPets-derived behavior that was imported

This pass intentionally borrowed the useful OpenPets-compatible endpoint ideas that made sense inside Freestyle:

- preset-based endpoint setup
- endpoint normalization
- provider-aware labeling
- provider-aware authentication headers
- support for non-local compatible providers
- practical handling for providers that do not behave like OpenAI on every supporting route

This pass did **not** turn Freestyle into a full copy of OpenPets’ chat runtime architecture.
Freestyle remains focused on cleanup-model and voice workflows, not OpenPets’ full desktop chat surface.

## Implementation surfaces

## Main OpenAPI-compatible files

- `packages/validations/src/openapi.ts`
  - preset registry
  - endpoint normalization rules
- `apps/server/src/lib/openapi-compatible.ts`
  - provider classification
  - provider labels
  - header construction
  - manual-discovery fallback hint logic
- `apps/server/src/routes/settings.ts`
  - compatible endpoint test route
  - `/models` discovery behavior
  - manual fallback response shape
- `apps/server/src/routes/models.ts`
  - compatible model listing for discovered catalogs
- `apps/server/src/lib/providers.ts`
  - cleanup-model provider construction via `@ai-sdk/openai`
- `apps/electron/src/renderer/src/pages/models/use-models.ts`
  - compatible connector state
  - manual model entry state
  - endpoint test/save behavior
- `apps/electron/src/renderer/src/pages/models/model-list.tsx`
  - preset chips
  - provider-aware placeholders
  - manual model/deployment input

## Main push-to-talk / audio files

- `apps/electron/src/main/audio-ducking.ts`
  - main duck/mute logic
  - restore handling
- `apps/electron/src/main/index.ts`
  - IPC wiring
  - audio ducking events
- `apps/electron/src/preload/index.ts`
- `apps/electron/src/preload/index.d.ts`
  - renderer API exposure for ducking controls
- `apps/electron/src/renderer/src/pages/app.tsx`
  - activation-time duck/mute handling
- `apps/electron/src/renderer/src/pages/settings.tsx`
  - audio ducking level slider
- `apps/electron/native/windows-mic-listener.c`
  - push-to-talk related Windows native mic-listener lane

## Tests and validation

This pass was validated locally with:

- `pnpm --filter @freestyle/electron typecheck`
- `pnpm --filter @freestyle/server test`
- `pnpm exec biome check ...` on the touched files

Server test result after the compatible-provider hardening:

- `90 passed`

Additional coverage added:

- compatible endpoint normalization tests
- preset coverage tests
- provider-label tests
- manual-discovery fallback route test

## Packaging note

The fresh post-document Windows packaging lane was run through the reverse-tunnel
Windows host using the staged script:

- `C:\Users\Anthracite Ace\Downloads\build-freestyle-20260612T235818Z.ps1`

That run completed and produced a fresh installer at:

- `C:\Users\Anthracite Ace\Downloads\Freestyle-0.1.8-setup.exe`
- size: `128867392` bytes
- timestamp: `2026-06-13 00:20:35 UTC`

During that rebuild, `compile:native` logged a non-fatal fallback warning for:

- `windows-mic-listener.exe`

The installer build still completed successfully after that warning.

`electron-builder` also logged non-fatal missing-resource warnings for:

- `apps/electron/resources/whisper/win32-x64`

That warning did not block installer creation, but it remains a packaging-hardening
follow-up if a fully self-contained Windows voice-runtime bundle is required.

## Delivery results

The requested post-document delivery sequence was completed as follows:

1. fresh Windows installer rebuild completed
2. installer moved into the Windows Downloads root:
   - `C:\Users\Anthracite Ace\Downloads\Freestyle-0.1.8-setup.exe`
3. modified repo bundle placed into the same Downloads folder:
   - `freestyle-repo-20260612T235818Z.tar.gz`
   - `freestyle-repo-20260612T235818Z.MANIFEST.txt`
   - `build-freestyle-20260612T235818Z.ps1`
4. repo bundle uploaded to the documented `VPS M` cold-backup host:
   - `/srv/backups/scriptorium/manual-handoffs/freestyle-20260612T235818Z/`

## Remote-delivery lane

The non-secret current host roles from the companion ops docs are:

- `212.227.13.220`
  - authoritative VPS XXL
  - active remote-development bridge host
- `212.227.22.66`
  - `VPS M`
  - retired from public-serving duty
  - retained as SSH-accessible cold-backup host

Existing scripted refresh precedent:

- `/home/dev/src/ScriptoriumAI/ops/ssh/run-vps-xxl-to-vps-m-curated-refresh.sh`

That script is designed for the portfolio-wide curated snapshot lane, but its documented target host and backup posture establish the correct non-secret destination for this Freestyle repo handoff packet.

## Known limitations after this pass

- Freestyle’s native cleanup-model runtime still uses the AI SDK’s OpenAI-compatible provider path rather than fully mirroring every OpenPets chat-runtime transport strategy.
- Some compatible providers may still require the user to know the correct model or deployment name even after endpoint validation succeeds.
- Packaging still logs the missing Windows whisper-resource warning noted above.
- `windows-mic-listener.exe` still showed a non-fatal native compile/link failure during the Windows rebuild and fell back instead of producing that helper binary.

## Net result

Freestyle is now materially closer to a real generic OpenAPI-compatible cleanup-model client rather than a localhost-only “Local LLM” form with a few borrowed presets.

The important correction is not just more preset labels.
The important correction is that non-OpenAI compatible providers can now remain usable even when shared `/models` discovery is absent or partial, because Freestyle now supports the manual model/deployment path needed by real-world providers such as Azure and other compatible gateways.
