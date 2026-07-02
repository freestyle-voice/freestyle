# Transcription Pipeline Audit

Audit of the transcription pipeline (2026-06-09, branch `optimize-transcribe`):
local whisper.cpp path (items 1–13) and cloud providers / streaming session layer (items C1–C14).
whisper.cpp behavior verified against the v1.8.5 source (pinned in `apps/server/src/lib/whisper/constants.ts:172`).

Status: `[ ]` open · `[x]` fixed on this branch (2026-06-09).

**Goal:** clean, open-source voice dictation with sub-second latency and high accuracy; minimal,
optimal implementations that reduce lines of code.

> **Fixed wholesale:** the local whisper path is now **server-only** (item 13). The CLI inference
> path (`lib/whisper/transcribe.ts`) was deleted; all per-request decode params live in one place
> (`providers/whisper-local.ts`). All items are now resolved except C13 (OpenAI GA realtime
> migration), which is deliberately deferred — it changes a working wire protocol and needs live
> verification against the OpenAI API.

---

# whisper.cpp path

## Correctness bugs

- [x] **1. Server path ignores the language setting (whisper-server defaults to `language=en`)**
  Fixed: `transcribeViaServer` now sends the `language` form field (skipped for "auto", matching
  prior CLI semantics — note "auto" still means English for local whisper, since real auto-detect
  doubles encoder cost on short clips).

- [x] **2. Changing the default model never reaches the running server**
  Fixed twice over: the provider now `await ensureServerRunning(modelId)` per request (restarts on
  model mismatch), and `PUT /models/configured/:id/default` pre-warms the server with the new model
  so the first post-switch transcription doesn't pay the load latency.

- [x] **3. Decode parameters diverge between CLI and server paths**
  Fixed: single path; sends `no_timestamps=true` and `temperature_inc=0.0` (the only way to disable
  the temperature-fallback retry ladder — the server's `--no-fallback` flag is dead code in v1.8.5).
  Server default is already greedy decode.

- [x] **4. Vocabulary bias silently doesn't exist for local whisper**
  Fixed: `buildAsrVocabularyBias` now treats `local-whisper` like openai/groq (prompt bias), and the
  provider sends it as the `prompt` form field (~224-token budget).

- [x] **5. Server failure falls back to CLI with `catch {}` — no logging**
  Fixed by removal: no CLI fallback. A failed inference logs a warning, restarts the server, and
  retries once; a second failure propagates to the route's error handling.

- [x] **6. Startup-timeout zombie process**
  Fixed: the 90s startup timeout now kills the spawned process before rejecting.

## Inefficiencies

- [x] **7. Binary discovery runs synchronously on the hot path**
  Fixed: `findWhisperBinary`/`findWhisperServer` results are cached; `resetBinaryCache()` is called
  after binaries are downloaded/built.

- [x] **8. Models stored twice on disk**
  Fixed: `downloadModel` streams the HF `resolve/` URL straight to the models dir (temp file +
  rename) via the existing `progressFetch` wrapper; the HF-cache intermediary (and the
  `downloadFileToCacheDir` dependency on this path) is gone.

- [x] **9. Unnecessary buffer copy in `transcribeViaServer`**
  Fixed: the Uint8Array view is passed to `Blob` directly.

- [x] **10. Fake-async history insert**
  Fixed: inserts run inline in `routes/transcribe.ts` (better-sqlite3 is synchronous either way).

- [x] **11. Dead/minor code in CLI path**
  Fixed by deletion of `lib/whisper/transcribe.ts`.

- [x] **12. Redundant readiness detection**
  Fixed: stdout string-matching removed; readiness is a 250ms HTTP poll (version-proof, and faster
  to detect than the old 2s poll).

## Design

- [x] **13. Collapse to server-only inference**
  Done. `providers/whisper-local.ts` ensures binaries, ensures the server runs the requested model,
  POSTs to `/inference` with all params, and retries once after a server restart. whisper-cli is no
  longer used for inference (still built/bundled; `ensureBinariesDownloaded` now keys off the
  server binary).

### Validated decisions (no action)

- Client-side 16kHz mono 16-bit WAV: whisper-server decodes/resamples arbitrary WAV via miniaudio
  since v1.7.5, but small uploads remain the right call.
- Greedy decoding for short dictation: beam-5 buys ≲1.5pp WER on clean speech at ~2×+ decode cost,
  and greedy hallucinates less.
- Restart-with-backoff + 30s stability window in `server.ts`.
- Pinning v1.8.5: contains the Windows handle-leak fix (empty `{"text":""}` after ~6 requests) and
  the cross-request context-bleed fix.
- whisper-server serializes inference behind a mutex — fine for dictation; the 120s client timeout
  covers a hung request.

### Optional latency levers (not currently needed)

- `audio_ctx` reduction for short clips — cuts encoder time roughly proportionally; community trick,
  slight accuracy risk.
- Built-in Silero VAD (`--vad` + model) — suppresses trailing-silence hallucinations.
- Flash attention is default-on since v1.8.0; passing `-fa` is a no-op.

### Known behavior (documented, intentional)

- Language "auto" on local whisper means English (whisper.cpp's default), not auto-detect.
  Auto-detect runs a duplicate encoder pass (~2× cost on short clips); users who dictate in another
  language should set it explicitly.

---

# Cloud providers & streaming session layer

Files: `apps/server/src/routes/stream.ts`, `apps/server/src/lib/streaming/providers/{openai,deepgram,elevenlabs,groq}.ts`,
`apps/server/src/lib/streaming/{utils,transcribe-bias}.ts`.

## Correctness bugs

- [x] **C1. Upstream error leaks the provider session**
  Fixed: `onError` in `routes/stream.ts` now closes the session before dropping the reference.

- [x] **C2. One transient error permanently disables streaming**
  Fixed: `streamingUnsupported` is reset on every `"start"` — an upstream error downgrades only the
  recording it happened in; each new recording retries streaming.

- [x] **C3. Settings changes never reach a live streaming session** (cloud twin of item 2)
  Fixed: `connectUpstream` records a fingerprint of (provider, model, language, bias); on `"start"`
  the session is reused only if the recomputed fingerprint matches, otherwise it is closed and
  reconnected with fresh settings.

- [x] **C4. OpenAI commit has no timeout**
  Fixed: same 12s commit timer as Deepgram/ElevenLabs, delivering accumulated partial text.

- [x] **C5. No network timeouts on cloud batch calls**
  Fixed: `CLOUD_TRANSCRIBE_TIMEOUT_MS` (120s) `AbortSignal` on `transcribeWithAiSdk`,
  `transcribeDeepgramListen`, and `transcribeElevenLabsWithBias`.

- [x] **C6. No Deepgram KeepAlive — idle sessions die and churn reconnects**
  Fixed: the Deepgram session sends `{"type":"KeepAlive"}` every 5s while the socket is open,
  holding the connection through idle periods between recordings.

- [x] **C7. Word-overlap dedup can delete words the user actually said**
  Fixed: one shared `mergeFinalSegment` (`lib/streaming/segments.ts`) with opt-in overlap dedup.
  Deepgram uses containment-only merging (finals cover distinct spans); ElevenLabs enables the
  5-word overlap dedup, where repeated-tail segments are a known auto-commit artifact.

- [x] **C8. ElevenLabs masks terminal errors during commit**
  Fixed: `auth_error`/`quota_exceeded` always surface via `onError` (triggering the client's WAV
  REST fallback, whose batch request reports the real failure); transient errors keep the
  salvage-partial-text behavior.

- [x] **C9. Stream route silently drops audio once 500 chunks are pending**
  Fixed: on overflow the route sends one `error` message, which triggers the renderer's WAV REST
  fallback (the full recording is preserved client-side, so no audio is lost).

- [x] **C10. Renderer commit timeout lost the recording**
  Fixed: the renderer's commit watchdog (was 30s, resolving empty) is now 15s and salvages via the
  REST fallback with the full recorded WAV — same path as `onError`, now shared
  (`restFallbackTranscribe` in `app.tsx`). Server-side commit timeouts fire at 12s, so 15s only
  triggers when the stream is truly dead.

## Inefficiencies / design

- [x] **C11. Duplicate merge logic**
  Fixed: extracted to `lib/streaming/segments.ts` (see C7).

- [x] **C12. Deepgram batch formatting depends on vocab presence**
  Fixed: all Deepgram batch transcription goes through `transcribeDeepgramListen` (one path,
  `smart_format=true` always); the AI SDK route and the `@ai-sdk/deepgram` dependency were removed.

- [ ] **C13. OpenAI realtime uses the beta API**
  `OpenAI-Beta: realtime=v1` + `transcription_session.update` (`providers/openai.ts`).
  Works today; plan migration to the GA realtime API before the beta surface disappears.

- [x] **C14. Dead branch + per-chunk copy in stream binary handling**
  Fixed: the unreachable `Buffer.isBuffer` arm was removed (Buffers pass `ArrayBuffer.isView`).
  The per-chunk `buffer.slice` copy remains (cheap at 80ms chunks).

### Validated decisions (no action)

- Pending-audio buffering with ready-token flush in `stream.ts` — no audio lost during connect races.
- Deepgram/ElevenLabs 12s commit timeouts; per-recording `reset()` instead of reconnect churn.
- Per-provider bias capping in `vocabulary-bias.ts` (keyterm count limits, URL-length awareness for
  streaming handshakes).
- Groq provider is appropriately minimal (batch-only via AI SDK with prompt bias).

---

## Remaining work

- **C13** — migrate the OpenAI realtime session off the beta API (`OpenAI-Beta: realtime=v1`) to the
  GA surface. Deferred deliberately: the beta protocol works today, the GA protocol has different
  session/event shapes, and the migration should be validated against the live API, not blind.
- Manual end-to-end dictation pass (local whisper + one cloud streaming provider) before merging —
  the automated tests don't exercise live providers or the whisper-server binary.
