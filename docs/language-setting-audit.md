# Language Setting Audit

How the Settings → "Language" option ("Hint for the transcription model.") flows
from the UI to each local and cloud transcription model, what works, and what
doesn't. Codebase audited against `main` (7ec6a5e); provider behavior verified
against official documentation and (for local models) the shipped model/worker
source. Last updated 2026-06-12.

## Status

Findings #1–#8, #10–#12 were implemented on 2026-06-12 (AI-SDK
providerOptions, Deepgram `multi`, whisper.cpp `auto`, Qwen3 ISO→name mapping,
MLX auto leak, GA realtime schema + 16→24 kHz upsampling, shared
normalization helper, shared UI language list, post-process language hint,
worker drop logging, tests in `apps/server/tests/language.test.ts`).
Remaining: Finding #9 (per-model capability map / dropdown annotations) and a
live smoke test of the OpenAI realtime GA migration (no OpenAI key was
configured locally at implementation time). The sections below describe the
state as found during the audit.

## TL;DR

The setting is persisted and routed correctly inside the app, but at the
provider boundary it breaks in two distinct ways:

**The hint never arrives (explicit language broken):**

1. **The AI-SDK batch path silently drops the hint for OpenAI, Groq, and
   ElevenLabs** — `language` is passed as a top-level option that
   `experimental_transcribe` does not accept; it must go through
   `providerOptions`. Groq has no streaming path, so the setting **has never
   worked for Groq**; OpenAI and ElevenLabs lose it on every batch/fallback
   transcription.
2. **Qwen3-ASR receives ISO codes ("en") but expects language names
   ("English")** — out-of-format on every Qwen3 request, batch and streaming.

**"Auto-detect" doesn't mean auto-detect (default setting broken):**

3. **Deepgram defaults to English when `language` is omitted** — our code
   omits it for "auto", so Auto-detect forces English and non-English speech
   is simply not transcribed.
4. **whisper.cpp defaults to English too** (`-l en`) — we launch
   whisper-server without `--language` and omit the form field for "auto",
   so Auto-detect forces English on the universal local fallback model.
5. **The MLX batch path forwards the literal string `"auto"`**, which breaks
   Qwen3's auto-detection on the REST fallback path (it's told the audio is
   in a language called "auto").

Plus: the OpenAI realtime session uses a deprecated beta event schema,
Parakeet silently ignores the hint, and there is zero test coverage on any of
this. Details below.

## Data flow

```
settings.tsx / onboarding.tsx          (renderer: <select>, ISO-639-1 or "auto")
        │  PUT /api/settings/language
        ▼
settings table (SQLite key/value)      (no validation; any string accepted)
        │  read per request
        ├─ routes/transcribe.ts:72-75  (batch POST /api/transcribe)
        │       └─ provider.transcribe({ ..., language })
        └─ routes/stream.ts:51-54      (WS /stream, re-read on every "start")
                └─ openStreamingSession({ ..., language })
```

- The stored value is an ISO-639-1 code (`en`, `es`, …) or `"auto"`.
- `types.ts:47` documents the contract: *"ISO-639-1 language hint; omitted or
  'auto' lets the model auto-detect."* That assumption is **false for
  Deepgram and whisper.cpp** (omitted ⇒ English, see Findings #2/#3), and
  enforcement of the `"auto"` filter is left to each provider individually
  (Finding #8).
- The streaming route fingerprints `(provider, model, language, bias)` per
  recording (`stream.ts:42-71`, `:374-408`), so a language change correctly
  rebuilds the upstream session on the next recording. ✅
- The batch endpoint is hit on two real paths: the non-streaming recording
  flow and the REST fallback when a streaming session errors/overflows
  (`app.tsx:293-320`), so batch-only bugs are user-visible.

## How each provider configures language (verified)

| Provider / model | Param | Format | Omitted ⇒ | Unsupported code ⇒ | Source |
|---|---|---|---|---|---|
| OpenAI batch (`/v1/audio/transcriptions`) | `language` (via AI SDK: `providerOptions.openai.language`) | ISO-639-1; 4o models also accept some ISO-639-3 | auto-detect | no HTTP error; transcribes with degraded quality | [API ref](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create), [STT guide](https://developers.openai.com/api/docs/guides/speech-to-text) |
| OpenAI Realtime transcription | `session.audio.input.transcription.language` via **`session.update`** with `session.type: "transcription"` (GA schema) | short codes, e.g. `en` | auto-detect | — | [Realtime guide](https://developers.openai.com/api/docs/guides/realtime-transcription) |
| Groq (`whisper-large-v3-turbo`) | `language` (via AI SDK: `providerOptions.groq.language`) | ISO-639-1, recommended not required | Whisper auto-detect | — (99+ languages) | [Groq STT docs](https://console.groq.com/docs/speech-to-text) |
| Deepgram nova-3 (`/v1/listen`, REST + WS) | `language` query param | short codes (`en`, `en-US`, …) + special `multi` | **defaults to `en`** — only that language is transcribed | not documented (validate client-side) | [Language docs](https://developers.deepgram.com/docs/language), [Models overview](https://developers.deepgram.com/docs/models-languages-overview) |
| ElevenLabs Scribe (batch + realtime WS) | `language_code` | ISO-639-1 **or** ISO-639-3 | `null` ⇒ language predicted automatically | 422 validation error possible | [STT convert](https://elevenlabs.io/docs/api-reference/speech-to-text/convert), realtime WS reference |
| whisper.cpp server (`/inference`) | `language` form field | ISO-639-1; **`"auto"` is a valid value** | **server CLI default `-l en`** | — | [server README](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server) |
| Qwen3-ASR (mlx-audio) | `language` kwarg → decoder prompt prefix | **full names** (`"English"`, matched case-insensitively against `config.support_languages`) | `None` ⇒ model emits detected language itself | unmatched value injected verbatim into prompt (silent corruption) | verified from `qwen3_asr.py` + model `config.json` in the shipped worker |
| Parakeet TDT 0.6B v3 (mlx-audio) | — none | — | always auto (25 European languages) | hint silently dropped by our worker | verified from `parakeet.py` signature in the shipped worker |
| AI SDK v6 `experimental_transcribe` | **no top-level `language` option** — `providerOptions` only | per provider above | — | extra keys silently discarded | verified from installed `ai@6.0.191` + provider package type definitions |

Notes from the research worth keeping:
- OpenAI's officially-listed quality bar is ~57 languages (all 21 of ours
  included); below-bar languages still transcribe, just worse.
- Deepgram nova-3's monolingual coverage has expanded substantially since its
  early-2025 launch (~10 languages) to roughly 50 per the current models
  overview — all 21 languages in our dropdown now appear in the nova-3 table.
- OpenAI's Realtime docs also list a newer `gpt-realtime-whisper`
  transcription model alongside `gpt-4o-transcribe`.
- The Deepgram language docs explicitly warn: *"Deepgram will only attempt to
  transcribe speech in that specified language. Speech in other,
  non-specified languages will not be transcribed."* — this applies to the
  implicit default `en` as well, which is what makes Finding #2 severe.

## Per-path status matrix

| Provider | Explicit language (batch) | Explicit language (streaming) | "Auto-detect" |
|---|---|---|---|
| OpenAI | ❌ dropped (Finding #1) | ✅ sent (`openai.ts:60`, but deprecated schema — Finding #6) | ✅ true auto |
| Groq | ❌ dropped (Finding #1) | n/a | ✅ true auto |
| Deepgram | ✅ sent | ✅ sent | ❌ **forces English** (Finding #2) |
| ElevenLabs | ⚠️ only with keyterms bias; ❌ on AI-SDK path (Finding #1) | ✅ sent | ✅ true auto |
| whisper.cpp | ✅ sent | n/a | ❌ **forces English** (Finding #3) |
| MLX Qwen3 | ⚠️ wrong format (Finding #4) | ⚠️ wrong format (Finding #4) | ❌ batch sends literal `"auto"` (Finding #5) / ✅ streaming |
| MLX Parakeet | — silently ignored (Finding #7) | — silently ignored | ✅ (model is always-auto) |

## Findings

### 1. Bug — AI-SDK batch path never sends the hint (OpenAI, Groq, ElevenLabs)

`transcribeWithAiSdk` (`streaming/utils.ts:18-26`) does:

```ts
const result = await transcribe({
  model,
  audio: opts.audio,
  abortSignal: AbortSignal.timeout(CLOUD_TRANSCRIBE_TIMEOUT_MS),
  ...(opts.language && opts.language !== "auto"
    ? { language: opts.language }     // ← not a transcribe() option
    : {}),
  ...(providerOptions ? { providerOptions } : {}),
});
```

`experimental_transcribe` in the installed AI SDK (`ai@6.0.191`) accepts only
`{ model, audio, providerOptions, maxRetries, abortSignal, headers, download }`.
The extra `language` property is **silently discarded** (spread properties
bypass TypeScript excess-property checking). The hint must be a provider
option; the installed SDK packages confirm the keys:

- `@ai-sdk/openai@3.0.65` → `providerOptions: { openai: { language } }`
- `@ai-sdk/groq@3.0.39` → `providerOptions: { groq: { language } }`
- `@ai-sdk/elevenlabs@2.0.33` → `providerOptions: { elevenlabs: { languageCode } }`

Blast radius:

- **Groq: the language setting has never worked** (no streaming path exists,
  so every Groq transcription goes through this code).
- **OpenAI: the hint is lost on every batch transcription** — including the
  REST fallback that runs precisely when the realtime WS fails, so a flaky
  streaming connection loses language support entirely.
- **ElevenLabs: lost on batch when no keyterms bias is active** (the bias
  path in `transcribe-bias.ts:99` builds the form manually and is correct).

Deepgram batch is unaffected (manual `fetch`, no AI SDK).

**Fix:** fold language into `providerOptions` keyed by provider id
(`languageCode` for ElevenLabs, `language` otherwise), merged with
`providerOptionsFromBias`. Add a test asserting the outgoing request body
contains the language.

### 2. Bug — "Auto-detect" forces English on Deepgram

Deepgram's `language` query parameter **defaults to `en`** when omitted, and a
set language is exclusive: speech in other languages is not transcribed. Our
code omits the parameter when the setting is `"auto"` (`deepgram.ts:74`,
`transcribe-bias.ts:37`), believing that enables auto-detection. It doesn't —
**Auto-detect (the app default for most non-English locales) silently forces
English on Deepgram**, both streaming and batch.

Deepgram has no general auto-detect for live streaming; the supported answer
is `language=multi` (code-switching mode, available with multilingual models
incl. nova-3) for streaming and `language=multi` or `detect_language` for
pre-recorded.

**Fix:** for Deepgram, map `"auto"`/unset → `language=multi` (our default
model is nova-3, which supports it) instead of omitting the parameter.

### 3. Bug — "Auto-detect" forces English on whisper.cpp

Same shape, local edition. whisper-server's CLI default is `-l en`
(`--language LANG [en] spoken language ('auto' for auto-detect)`), and we
spawn it with only `--model/--port/--host` (`whisper/server.ts:106-113`).
`transcribeViaServer` (`whisper-local.ts:68`) omits the `language` form field
for `"auto"`, so the server decodes with `language=en`.

whisper.cpp explicitly accepts `"auto"` as a value — the one provider where
forwarding `"auto"` is exactly right, and the one place we strip it.

A user dictating Spanish on the recommended whisper.cpp fallback model with
Auto-detect gets English-forced decoding (mistranscribed or
quasi-translated output).

**Fix:** always send the `language` form field for whisper.cpp, passing
`"auto"` through verbatim (or launch the server with `--language auto` and
keep per-request overrides).

### 4. Bug — Qwen3-ASR gets ISO codes, expects language names (all paths)

The UI stores ISO-639-1 codes. The MLX worker forwards the value verbatim to
`model.generate(language=...)`. mlx-audio's Qwen3-ASR matches it
case-insensitively against the model's `support_languages` — **full English
names** (from the shipped model's `config.json`):

```
['Chinese', 'English', 'Cantonese', 'Arabic', 'German', 'French', 'Spanish',
 'Portuguese', 'Indonesian', 'Italian', 'Korean', 'Russian', 'Thai',
 'Vietnamese', 'Japanese', 'Turkish', 'Hindi', 'Malay', 'Dutch', 'Swedish',
 'Danish', 'Finnish', 'Polish', 'Czech', 'Filipino', 'Persian', 'Greek',
 'Romanian', 'Hungarian', 'Macedonian']
```

On no match the raw value is injected into the decoder prompt
(`qwen3_asr.py::_build_prompt`):

```python
lang_name = supported_lower.get(language.lower(), language)  # "en" → "en"
assistant_prefix = f"language {lang_name}<asr_text>"          # "language en<asr_text>"
```

So the recommended local model (Qwen3, the onboarding hero pick) is
force-prefixed with `language en` — an out-of-distribution token sequence —
instead of `language English`. Affects batch and streaming, every non-auto
language.

**Fix:** map ISO → Qwen3 names before calling the worker (en→English,
es→Spanish, fr→French, de→German, it→Italian, pt→Portuguese, nl→Dutch,
ru→Russian, zh→Chinese, ja→Japanese, ko→Korean, ar→Arabic, hi→Hindi,
pl→Polish, tr→Turkish, sv→Swedish, da→Danish, fi→Finnish). `uk` (Ukrainian)
and `no` (Norwegian) have **no Qwen3 equivalent** — see Finding #9.

### 5. Bug — MLX batch path forwards the literal `"auto"`

- `mlx-local.ts:64-65` (streaming): filters `"auto"` ✅
- `mlx-local.ts:47` (batch): `language: opts.language` ❌

`transcribe.ts:108` spreads `...(language ? { language } : {})` and `"auto"`
is truthy, so it reaches the worker, which only drops empty strings. Qwen3
then builds the prefix `language auto<asr_text>` — telling the model the
audio is in a language called "auto" instead of letting it auto-detect
(`language=None` makes the model emit `language {detected}<asr_text>`
itself). Hits the REST-fallback path for any Qwen3 user on Auto-detect.

**Fix (one line):** filter `"auto"` in
`MlxLocalTranscriptionProvider.transcribe`, or better, normalize at the
boundary (Finding #8).

### 6. Risk — OpenAI realtime session uses the deprecated beta schema

`openai.ts:51-73` connects with the `OpenAI-Beta: realtime=v1` header and
configures the session via `transcription_session.update` with
`input_audio_transcription.language`. The current GA Realtime API configures
transcription sessions via **`session.update`** with:

```json
{ "type": "session.update",
  "session": { "type": "transcription",
    "audio": { "input": {
      "format": { "type": "audio/pcm", "rate": 24000 },
      "transcription": { "model": "gpt-4o-transcribe", "language": "en" } } } } }
```

The GA guide no longer mentions `transcription_session.update` at all. The
beta shape still functions today (our handler already listens for both
`transcription_session.*` and `session.*` event names), but it is a
deprecation time bomb — and when it breaks, the failure mode is the client
falling back to batch, which is the path that drops the language hint
(Finding #1). The guide also lists a newer `gpt-realtime-whisper`
transcription model worth evaluating.

**Fix:** migrate to the GA `session.update` schema (language stays a short
code, so no value-format change), and consider removing the beta header.

### 7. Parakeet silently ignores the hint

Parakeet's `generate(audio, *, dtype, chunk_duration, ..., **kwargs)` has no
`language` parameter, so the worker's `_pick_supported_param` drops the kwarg
with no log. Parakeet is auto-detecting across 25 European languages, so
results are usually fine, but nothing tells the user the setting has no
effect for this model, and the silent drop would also mask a future mlx-audio
kwarg rename for all MLX models.

**Suggestion:** worker logs a stderr line when a requested hint is dropped;
model catalog gains a "language hint supported" flag the settings page can
surface.

### 8. Inefficiency — `"auto"` semantics enforced in seven places, and the contract is wrong

The `language !== "auto"` filter is copy-pasted into `openai.ts:60`,
`deepgram.ts:74`, `elevenlabs.ts:152`, `whisper-local.ts:68`, `utils.ts:22`,
`transcribe-bias.ts:37`/`:99`, `mlx-local.ts:64` — and the omissions/misfits
are exactly where Findings #2, #3, and #5 live. Worse, the shared contract
"omitted == auto" (`types.ts:47`) is simply not true per provider docs:
omitted means *English* on Deepgram and whisper.cpp.

**Fix:** normalize once where the setting is read (shared
`getLanguageSetting()` helper returning `string | undefined`), then let each
provider translate `undefined` into *its* correct auto behavior:
`language=multi` (Deepgram), `language=auto` (whisper.cpp), omit (OpenAI,
Groq, ElevenLabs), `None` (MLX). Both routes also duplicate the raw
`SELECT value FROM settings WHERE key = 'language'` — fold into the helper.

Related micro-issue: `stream.ts:64-69` fingerprints `language ?? null`, so
`"auto"` and *unset* produce different config keys and needlessly rebuild the
upstream session when toggled. Normalizing first fixes this too.

### 9. Per-model language coverage gaps (verified)

Our 21-language dropdown vs verified provider coverage:

- **OpenAI / Groq / ElevenLabs / whisper.cpp**: all 21 covered (OpenAI's
  57-language quality list and Whisper's 99-language training set include
  every dropdown entry; ElevenLabs Scribe advertises 99).
- **Deepgram nova-3**: per the current models overview, all 21 dropdown
  languages now appear (coverage expanded well beyond the ~10 at launch).
  Error behavior for a genuinely unsupported code is undocumented, so
  client-side validation is still worthwhile.
- **Qwen3-ASR**: 30 languages; missing from our dropdown's perspective:
  Ukrainian (`uk`), Norwegian (`no`).
- **Parakeet v3**: 25 European languages; non-European dropdown entries
  (zh, ja, ko, ar, hi) are out of scope — moot today since the hint is
  ignored (Finding #7), but relevant if per-model UI annotations are added.

There is also no server-side validation: `routes/settings.ts` is a generic
key/value store, so any string can become the language via the API.

**Suggestion:** add a per-provider language capability map (the
`vocabulary-bias.ts` pattern) used to (a) translate/drop hints server-side,
(b) annotate or filter the dropdown per selected model.

### 10. Duplication — two divergent hardcoded language lists in the UI

- `settings.tsx:632-653`: 21 inline `<option>`s, English labels.
- `onboarding.tsx:81-94`: separate `ONBOARDING_LANGUAGES` array, 12 entries,
  native-name labels.

Already drifted (onboarding lacks `ar`, `pl`, `tr`, `sv`, `da`, `no`, `fi`,
`uk`; labels differ). **Fix:** one shared constant with an onboarding subset.

### 11. Improvement — post-processing is language-blind

`post-process.ts` never sees the language setting: the filler-word pre-check
(`:107`) only strips English fillers, and the LLM cleanup prompt
(`:140-166`) is English-centric (`"three hundred dollars" → "$300"`,
`"dot" → "."`). "Do NOT translate" protects meaning, but non-English
transcripts are edited under English conventions.

**Suggestion:** thread the language into `postProcess()` and add one prompt
line ("The transcript is in {language}; keep the output in that language…").

### 12. Gap — zero test coverage

`apps/server/tests/` contains no test touching the language setting — not
the route plumbing, not the per-provider parameter mapping, not the `"auto"`
semantics. Every bug above would have been catchable by a unit test that
stubs the provider HTTP layer and asserts the outgoing request. Vocabulary
bias already has exactly this style of coverage (`vocabulary-bias.test.ts`);
language should mirror it.

### 13. Side observation — Groq streaming metadata mismatch

`models.ts:171-177` marks `groq/whisper-large-v3-turbo` as `streaming: true`,
but `GroqTranscriptionProvider.supportsStreaming()` returns `false` and no
`openStreamingSession` exists. The UI advertises live streaming for a model
the backend serves batch-only.

## What is wired correctly ✅

- Persistence: settings UI and onboarding write the same `language` key;
  batch reads per request; streaming re-resolves config per recording — no
  stale-session bugs.
- ISO-639-1 is the right stored format for OpenAI, Groq, Deepgram, ElevenLabs
  (also accepts 639-3), and whisper.cpp — only the MLX/Qwen3 path needs
  translation.
- Streaming sessions for Deepgram and ElevenLabs send the correct parameter
  (`language` / `language_code`); OpenAI realtime sends the right field on a
  deprecated event shape.
- Deepgram batch and the ElevenLabs keyterms-bias batch path build requests
  manually and correctly.

## Recommended fix order

1. **Finding #1** — route language through `providerOptions` in
   `transcribeWithAiSdk` (restores the setting for Groq entirely, and for
   OpenAI/ElevenLabs batch).
2. **Findings #2 + #3 + #5 + #8 together** — introduce the shared
   `getLanguageSetting()` helper and per-provider auto semantics:
   `multi` for Deepgram, `auto` for whisper.cpp, omit elsewhere. This fixes
   both English-forcing bugs and the MLX `"auto"` leak in one refactor.
3. **Finding #4** — ISO → name mapping for Qwen3.
4. **Finding #12** — request-level tests for every provider's language
   parameter, locking all of the above in.
5. **Finding #6** — migrate OpenAI realtime to the GA `session.update`
   schema.
6. **Findings #7, #9, #10** — capability map, dropped-hint logging, shared
   UI language list.
7. **Finding #11** — pass language into post-processing.
