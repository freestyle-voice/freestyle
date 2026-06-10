# Transcription Pipeline Audit

Audit of the transcription pipeline (2026-06-09, branch `optimize-transcribe`):
local whisper.cpp path (items 1–13) and cloud providers / streaming session layer (items C1–C14).
whisper.cpp behavior verified against the v1.8.5 source (pinned in `apps/server/src/lib/whisper/constants.ts:172`).

Status: `[ ]` open · `[x]` fixed on this branch (2026-06-09).

**Goal:** clean, open-source voice dictation with sub-second latency and high accuracy; minimal,
optimal implementations that reduce lines of code.

> **Fixed wholesale:** the local whisper path is now **server-only** (item 13). The CLI inference
> path (`lib/whisper/transcribe.ts`) was deleted; all per-request decode params live in one place
> (`providers/whisper-local.ts`). Net effect: items 1–7 and 9–13 below are resolved by that refactor
> plus small targeted fixes. Items 8 and most cloud items remain open.

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

- [ ] **8. Models stored twice on disk**
  `downloadModel` uses `downloadFileToCacheDir` (HF cache) then `copyFileSync` into the models dir
  (`apps/server/src/lib/whisper/models.ts`). large-v3-turbo → 3.2 GB for one model.
  **Fix:** download straight to `getModelPath()`, or hardlink instead of copy.

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

- [ ] **C3. Settings changes never reach a live streaming session** (cloud twin of item 2)
  On `"start"`, an existing session with `reset()` is reused as-is (`stream.ts`); provider, model,
  language, and vocabulary bias were captured at session creation. Changing vocab terms, language,
  or provider only takes effect when the upstream happens to die and reconnect.
  **Fix:** on `"start"`, compare current defaults/bias against the session's config; recycle on change.

- [x] **C4. OpenAI commit has no timeout**
  Fixed: same 12s commit timer as Deepgram/ElevenLabs, delivering accumulated partial text.

- [x] **C5. No network timeouts on cloud batch calls**
  Fixed: `CLOUD_TRANSCRIBE_TIMEOUT_MS` (120s) `AbortSignal` on `transcribeWithAiSdk`,
  `transcribeDeepgramListen`, and `transcribeElevenLabsWithBias`.

- [ ] **C6. No Deepgram KeepAlive — idle sessions die and churn reconnects**
  Deepgram closes streaming sockets after ~10s without audio (NET-0001). The upstream opens at
  client-socket connect and idles between recordings, so every pause burns the 3 reconnect attempts
  in a loop; ElevenLabs fetches a fresh single-use token per cycle.
  **Fix:** send `{"type":"KeepAlive"}` every ~5s while idle, or open the upstream lazily on `"start"`.

- [ ] **C7. Word-overlap dedup can delete words the user actually said**
  `mergeFinalSegment` (`providers/deepgram.ts`) and `joinSegments` (`providers/elevenlabs.ts`)
  strip up to 5 repeated boundary words — "very, very" across a segment boundary loses one. The
  comment's premise is also shaky: Deepgram `is_final` results cover distinct spans (not cumulative).
  The dedup protects against ElevenLabs auto-commit overlap (real), but is applied blanket to correct
  input too.
  **Fix:** scope the dedup to the ElevenLabs auto-commit case; for Deepgram, plain append per final span.

- [ ] **C8. ElevenLabs masks terminal errors during commit**
  `quota_exceeded`/`auth_error` arriving while a commit is pending (`providers/elevenlabs.ts`)
  silently delivers partial text as final — the user never learns their key/quota is dead.
  **Fix:** surface the error alongside (or instead of) the salvaged text for non-transient error types.

- [ ] **C9. Stream route silently drops audio once 500 chunks are pending**
  (`routes/stream.ts`) — no error surfaced to the client.

- [ ] **C10. Renderer REST fallback only fires on explicit `onError`**
  (`apps/electron/src/renderer/src/pages/app.tsx:310-340`) — a silently-stalled stream loses the
  recording; no watchdog timeout on commit.

## Inefficiencies / design

- [ ] **C11. Duplicate merge logic**
  `mergeFinalSegment`/`previewText` (deepgram.ts) and `joinSegments` (elevenlabs.ts) are the same
  algorithm implemented twice. Extract one shared util (and fix C7 there once).

- [ ] **C12. Deepgram batch formatting depends on vocab presence**
  The bias path sets `smart_format=true` (`transcribe-bias.ts`); the AI SDK path doesn't. Adding a
  vocabulary word changes number/date formatting.
  **Fix:** align params across both paths (or route both through one implementation).

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

## Remaining work, in priority order

1. **C3** — recycle live streaming sessions when defaults/bias change (correctness, parallels fixed item 2).
2. **C6** — Deepgram KeepAlive or lazy upstream connect (reliability + connection churn).
3. **C7 + C11** — one shared segment-merge util with the dedup scoped to ElevenLabs auto-commit.
4. **C8** — surface terminal ElevenLabs errors; **C9/C10** — audio-drop signaling and a renderer commit watchdog.
5. **8** — stop double-storing whisper models on disk; **C12** — align Deepgram batch params; **C13** — OpenAI GA realtime migration.
