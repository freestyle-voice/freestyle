# Language Setting Audit

How the Settings → "Language" option ("Hint for the transcription model.") flows
from the UI to each local and cloud transcription model, what works, and what
doesn't. Audited 2026-06-12 against `main` (7ec6a5e).

## TL;DR

The setting is persisted and routed correctly, but it never reaches several
models:

1. **The AI-SDK batch path silently drops the hint for OpenAI, Groq, and
   ElevenLabs.** `transcribeWithAiSdk` passes a top-level `language` option
   that the AI SDK's `transcribe()` does not accept — it must go through
   `providerOptions`. Groq has no streaming path, so the hint **never works
   for Groq at all**; OpenAI and ElevenLabs lose it on every batch/fallback
   transcription.
2. **Qwen3-ASR receives ISO codes ("en") but expects language names
   ("English")** — the hint is out-of-format on every Qwen3 request, batch and
   streaming.
3. **The MLX batch path forwards the literal string `"auto"`** instead of
   omitting it, which actively breaks Qwen3's auto-detection on the REST
   fallback path.
4. **Parakeet silently ignores the hint** (its `generate()` has no `language`
   parameter), with no log or UI indication.

There are also several smaller consistency/duplication issues listed below.

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

- The value stored is an ISO-639-1 code (`en`, `es`, …) or `"auto"`.
- `types.ts:47` documents the contract: *"ISO-639-1 language hint; omitted or
  'auto' lets the model auto-detect."* Enforcement, however, is left to each
  provider individually (see Finding #5).
- The streaming route fingerprints `(provider, model, language, bias)` per
  recording (`stream.ts:42-71`, `:374-408`), so a language change correctly
  rebuilds the upstream session on the next recording. ✅
- The batch route reads the setting on every request. ✅
- The batch endpoint is hit on two real paths: the non-streaming recording flow
  and the REST fallback when a streaming session errors/overflows
  (`app.tsx:293-320`), so batch-only bugs are user-visible.

## Per-provider matrix

| Provider | Model(s) | Batch | Streaming | Param required | `"auto"` filtered? |
|---|---|---|---|---|---|
| OpenAI | gpt-4o-transcribe | ❌ dropped (`utils.ts:22`, Finding #1) | ✅ `openai.ts:60` | `providerOptions.openai.language` / WS `language` | ✅ both |
| Groq | whisper-large-v3-turbo | ❌ dropped (`utils.ts:22`, Finding #1) | n/a (no streaming) | `providerOptions.groq.language` | — |
| Deepgram | nova-3 | ✅ `transcribe-bias.ts:37` | ✅ `deepgram.ts:74` | `language` query param | ✅ both |
| ElevenLabs | scribe_v2(_realtime) | ⚠️ only with keyterms bias (`transcribe-bias.ts:99`); ❌ dropped on the AI-SDK path (`utils.ts:22`) | ✅ `elevenlabs.ts:152` | `providerOptions.elevenlabs.languageCode` / `language_code` | ✅ where sent |
| whisper.cpp (local) | base/small/large… | ✅ `whisper-local.ts:68` | n/a (no streaming) | `language` form field | ✅ |
| MLX (local) | qwen3-*, parakeet | ⚠️ `mlx-local.ts:47` (Findings #2/#3) | ⚠️ `mlx-local.ts:64` (Finding #2) | `language` kwarg via worker | ❌ batch / ✅ streaming |

All whisper.cpp catalog models are multilingual variants (no `.en` models), so
there is no English-only-model mismatch there.

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

But `experimental_transcribe` in the installed AI SDK (`ai@6.0.191`) accepts
only `{ model, audio, providerOptions, maxRetries, abortSignal, headers,
download }`. There is no top-level `language` option — the function
destructures the known keys and the extra `language` property is **silently
discarded**. TypeScript doesn't catch it because spread properties bypass
excess-property checking.

The hint must be sent as a provider option, and each SDK package confirms the
key (verified in the installed `node_modules` type definitions):

- `@ai-sdk/openai@3.0.65` → `providerOptions: { openai: { language } }`
- `@ai-sdk/groq@3.0.39` → `providerOptions: { groq: { language } }`
- `@ai-sdk/elevenlabs@2.0.33` → `providerOptions: { elevenlabs: { languageCode } }`

Blast radius:

- **Groq (whisper-large-v3-turbo): the language setting has never worked.**
  Groq has no streaming session, so every Groq transcription goes through
  this path.
- **OpenAI (gpt-4o-transcribe): the hint is lost on every batch
  transcription** — the non-streaming recording flow and the REST fallback
  that kicks in when the realtime WS errors. (The realtime streaming path
  does send it correctly, `openai.ts:60`.) Note the fallback chain compounds
  this: if the realtime session fails, the client retries via
  `/api/transcribe`, which is exactly the path that drops the hint — so an
  OpenAI user with a flaky streaming connection effectively loses language
  support entirely.
- **ElevenLabs: the hint is lost on batch when no keyterms bias is active**
  (the bias path in `transcribe-bias.ts:99` builds the form manually and is
  correct).

Deepgram batch is unaffected — it never goes through the AI SDK
(`transcribeDeepgramListen` builds the request manually).

**Fix:** in `transcribeWithAiSdk`, fold the language into `providerOptions`
keyed by provider id, e.g.:

```ts
const lang = opts.language && opts.language !== "auto" ? opts.language : undefined;
const langKey = providerId === "elevenlabs" ? "languageCode" : "language";
const providerOptions = mergeProviderOptions(
  providerOptionsFromBias(providerId, opts.bias),
  lang ? { [providerId]: { [langKey]: lang } } : undefined,
);
```

A regression test should assert the outgoing request body contains the
language (the AI SDK forwards provider options into the multipart body).

### 2. Bug — Qwen3-ASR gets ISO codes, expects language names (all paths)

The UI stores ISO-639-1 codes (`"en"`, `"fr"`). The MLX worker forwards the
value verbatim to `model.generate(language=...)`. mlx-audio's Qwen3-ASR matches
that value case-insensitively against the model's `support_languages` —
which are **full English names**:

```
['Chinese', 'English', 'Cantonese', 'Arabic', 'German', 'French', 'Spanish', ...]
```

On no match it injects the raw value into the decoder prompt
(`qwen3_asr.py::_build_prompt`):

```python
lang_name = supported_lower.get(language.lower(), language)  # "en" → "en"
assistant_prefix = f"language {lang_name}<asr_text>"          # "language en<asr_text>"
```

So with Language = English, the recommended local model (Qwen3 is the
onboarding hero pick) is force-prefixed with `language en` — an
out-of-distribution token sequence the model was never trained on, instead of
`language English`. The hint is at best ignored and at worst degrades accuracy.
This affects **both** batch and streaming MLX paths, for every non-auto
language.

**Fix:** map ISO codes → Qwen3 language names before calling the worker (in
`MlxLocalTranscriptionProvider` or in `mlx_asr_server.py`, keyed off the model
family). The settings codes covering Qwen3's list: en→English, es→Spanish,
fr→French, de→German, it→Italian, pt→Portuguese, nl→Dutch, ru→Russian,
zh→Chinese, ja→Japanese, ko→Korean, ar→Arabic, hi→Hindi, pl→Polish, tr→Turkish,
sv→Swedish, da→Danish, fi→Finnish. Note `uk` (Ukrainian) and `no` (Norwegian)
have **no Qwen3 equivalent** — see Finding #6.

### 3. Bug — MLX batch path forwards the literal `"auto"`

Every provider that sends the hint filters `"auto"` first — except the MLX
**batch** path:

- `mlx-local.ts:64-65` (streaming): `opts.language !== "auto" ? opts.language : undefined` ✅
- `mlx-local.ts:47` (batch): `language: opts.language` ❌ — `"auto"` passes through

`transcribe.ts:108` spreads `...(language ? { language } : {})`, and `"auto"`
is truthy, so it reaches the worker. The worker only drops empty strings
(`mlx_asr_server.py::_transcribe_kwargs`), so Qwen3 builds the prompt prefix
`language auto<asr_text>`. That **defeats auto-detection** — with
`language=None` the model emits `language {detected}<asr_text>` itself; with
the bogus prefix it's told the audio is in a language called "auto".

Since "Auto-detect" is the settings default for most non-English locales
(`onboarding.tsx:96-99` falls back to `"auto"`), this hits the REST-fallback
transcription path for any Qwen3 user whose streaming session degrades.

**Fix (one line):** filter `"auto"` in `MlxLocalTranscriptionProvider.transcribe`
the same way the streaming session does. Better: normalize once at the
boundary (Finding #5) so per-provider filtering disappears entirely.

### 4. Parakeet silently ignores the hint

Parakeet's `generate(audio, *, dtype, chunk_duration, ..., **kwargs)` has no
`language` parameter, so `_pick_supported_param` drops the kwarg without any
log. A user who picks "French" with Parakeet gets no hint and no feedback.
Parakeet is multilingual/auto-detecting so results are usually fine, but:

- Nothing in the UI says the Language setting has no effect for this model
  (the model note only says "25 languages · no custom vocabulary").
- The silent drop also hides genuine regressions — if mlx-audio renames the
  kwarg, the hint vanishes for all MLX models with zero signal.

**Suggestion:** have the worker log (stderr) when a requested language hint is
dropped, and surface per-model "language hint supported: yes/no" in the model
catalog metadata so the settings page can annotate the picker.

### 5. Inefficiency — the `"auto"` contract is enforced in seven places

`types.ts:47` says omitted and `"auto"` are equivalent, but the normalization
is copy-pasted into each provider: `openai.ts:60`, `deepgram.ts:74`,
`elevenlabs.ts:152`, `whisper-local.ts:68`, `utils.ts:22`,
`transcribe-bias.ts:37` and `:99`, `mlx-local.ts:64` — and the one omission is
exactly where Finding #3 lives.

**Fix:** normalize once where the setting is read (`transcribe.ts` /
`stream.ts`, or a shared `getLanguageSetting()` helper):

```ts
const language = value && value !== "auto" ? value : undefined;
```

Then providers can trust `language` is a real code and drop their local
checks. (Both routes currently also duplicate the raw
`SELECT value FROM settings WHERE key = 'language'` — fold that into the same
helper.)

Related micro-issue: `stream.ts:64-69` fingerprints `language ?? null`, so
`"auto"` and *unset* produce different config keys even though they mean the
same thing — toggling between them needlessly tears down and rebuilds the
upstream session. Normalizing first fixes this too.

### 6. No per-model validation of the language list

The settings dropdown offers 21 languages to every model, but support varies:

- **Qwen3-ASR**: no Ukrainian (`uk`), no Norwegian (`no`) (see list in #2).
- **Deepgram nova-3**: supports a limited language set; several settings
  options (e.g. `uk`, `sv`, `fi`) likely return a 400 from the `/listen` API,
  which surfaces only as a generic "Transcription failed". (Exact list should
  be verified against current Deepgram docs.)
- **Whisper-family and ElevenLabs scribe**: effectively cover the full list.

There is also no server-side validation: `routes/settings.ts` is a generic
key/value store, so any string can become the language via the API.

**Suggestion:** keep the stored value as ISO-639-1, but add a per-provider
capability map (the codebase already has this pattern for vocabulary bias in
`vocabulary-bias.ts`) used to (a) drop unsupported hints server-side instead of
sending a request that will 400, and (b) optionally annotate the dropdown.

### 7. Duplication — two divergent hardcoded language lists in the UI

- `settings.tsx:632-653`: 21 inline `<option>`s, English labels.
- `onboarding.tsx:81-94`: separate `ONBOARDING_LANGUAGES` array, 12 entries,
  native-name labels.

They have already drifted (onboarding lacks `ar`, `pl`, `tr`, `sv`, `da`,
`no`, `fi`, `uk`; labels differ). **Fix:** one shared constant (e.g. in
`renderer/src/lib/`), with a flag or slice for the onboarding subset.

### 8. Improvement — post-processing is language-blind

`post-process.ts` never sees the language setting:

- The pre-check filler regex (`:107`) only strips English fillers
  (`um, uh, you know, i mean`).
- The LLM cleanup system prompt (`:140-166`) is English-centric — examples
  like `"three hundred dollars" → "$300"` and `"dot" → "."` only make sense
  for English dictation. It does say "Do NOT translate", which protects
  meaning, but a Spanish transcript still gets edited under English-specific
  instructions.

**Suggestion:** thread the language setting into `postProcess()` and add one
line to the prompt ("The transcript is in {language}; keep the output in that
language and apply the equivalent spoken-artifact conventions.").

### 9. Side observation — Groq streaming metadata mismatch

Not a language issue, found during the audit: `models.ts:171-177` marks
`groq/whisper-large-v3-turbo` as `streaming: true`, but
`GroqTranscriptionProvider.supportsStreaming()` returns `false` and the
provider has no `openStreamingSession`. The UI therefore advertises live
streaming for a model the backend will only serve in batch mode.

## What is wired correctly ✅

- Persistence: settings UI and onboarding both write the same `language` key;
  the default (`"auto"` / unset) means auto-detect everywhere except Finding #3.
- Freshness: batch reads per request; streaming re-resolves config on every
  recording `start` and rebuilds the session when the language changes — no
  stale-session bug.
- Streaming sessions for OpenAI (realtime WS), Deepgram, and ElevenLabs send
  the hint with the correct parameter name for their API.
- Deepgram batch and the ElevenLabs keyterms-bias batch path build their
  requests manually and send the hint correctly.
- whisper.cpp receives the hint as the `language` form field and its catalog
  contains only multilingual models.

## Recommended fix order

1. Route language through `providerOptions` in `transcribeWithAiSdk`
   (Finding #1 — restores the setting for Groq entirely and for OpenAI /
   ElevenLabs batch).
2. Filter `"auto"` in `MlxLocalTranscriptionProvider.transcribe` (one line,
   user-facing bug — Finding #3).
3. Map ISO codes → Qwen3 language names for the MLX worker (Finding #2).
4. Centralize language normalization + the settings read in one helper;
   remove per-provider `!== "auto"` checks (Finding #5).
5. Share one language list between settings and onboarding (Finding #7).
6. Per-model language capability map + dropped-hint logging (Findings #4, #6).
7. Pass language into post-processing (Finding #8).
