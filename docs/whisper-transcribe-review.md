# Whisper Transcription Pipeline — Review

Review of `apps/server/src/lib/whisper/transcribe.ts` and the surrounding
transcription code (provider, server lifecycle, route).

## Architecture recap

`transcribeWithWhisper` (`transcribe.ts`) is the **CLI path**: it spawns
`whisper-cli` per request, reloading the model from disk each time.

The steady-state path is actually `transcribeViaServer`
(`whisper-local.ts:86`) — a long-lived `whisper-server` process that keeps the
model resident in memory. The CLI path is used only on the very first request
(and as a fallback) while the server warms up in the background
(`whisper-local.ts:69`).

This split matters: **several options that are set in the CLI path are silently
dropped on the server path** (see bugs #2 and #6).

---

## Bugs

### 1. Multibyte UTF-8 corruption in stdout decoding — `transcribe.ts:92`

```ts
proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
```

Each pipe chunk is decoded independently. A UTF-8 sequence (accented Latin,
CJK, emoji) split across a chunk boundary becomes replacement characters (`�`).
Because this is the actual transcript (not a log line), any non-ASCII dictation
can be corrupted non-deterministically.

**Fix:** collect `Buffer`s and decode once — `Buffer.concat(chunks).toString("utf8")`
— or pipe through a `StringDecoder`.

### 2. `language` is ignored on the server path — `whisper-local.ts:52` / `86`

The CLI path passes `--language` (`transcribe.ts:65-67`), but
`transcribeViaServer` never forwards it. `whisper-server`'s `/inference`
endpoint accepts a `language` form field. So in the *common* steady-state path,
the user's language setting is ignored and whisper auto-detects every time —
slower and more error-prone for non-English users, and inconsistent with the
CLI path.

**Fix:** `form.append("language", language)` when set.

### 3. `[BLANK_AUDIO]` / sound-annotation tokens leak into transcripts — `transcribe.ts:123`

```ts
.replace(/^\[[\d:.,\s\->]+\]\s*/, "")
```

The strip regex only matches timestamp characters (digits / `:` / `.` / `,` /
`->`). whisper.cpp emits literal markers like `[BLANK_AUDIO]`, `[ Silence ]`,
`(wind blowing)` for silent or near-silent clips. These contain letters, so
they survive the regex and get returned as transcript text. Short or silent
recordings will produce a literal `"[BLANK_AUDIO]"`.

**Fix:** explicitly filter out these annotation/marker tokens.

### 4. Timeout produces a misleading error and isn't distinguished — `transcribe.ts:85,104`

`spawn(..., { timeout: 120_000 })` kills the child with SIGTERM on timeout, so
`close` fires with `code === null`. The handler hits `if (code !== 0)` and
reports `"whisper.cpp failed: exit code null"`. The `signal` argument is
ignored. A 2-minute hang surfaces as a confusing message.

**Fix:** handle `(code, signal)` in the close handler and emit an explicit
timeout error.

### 5. Fragile model coupling on the server path — `whisper-local.ts:49`

`isServerRunning()` only checks process + ready; it does **not** verify the
running server's `currentModelId` matches the requested model. In the normal
flow the frontend triggers a restart on model switch (`selectLocalVoice` →
`/server/start`), so it usually works — but there's no defense in depth. Any
path that changes the default model without calling `/server/start` (e.g. the
currently-unused `PUT /configured/:id/default` route) would silently transcribe
with the *old* model.

**Fix:** export `getCurrentModelId()` and check it before using the server;
fall back to restart/CLI on mismatch.

### 6. `bias` (vocabulary bias) is dropped for local whisper — `whisper-local.ts:28`

`TranscribeOptions.bias` is plumbed all the way to the provider, but neither the
CLI nor the server path uses it. whisper.cpp supports `--prompt` /
`initial_prompt`. If vocab bias is meant to apply to local models, it's a silent
no-op today. (May be intentional — flagging so it's a deliberate choice.)

---

## Inefficiencies

### 7. Synchronous FS on the request hot path — `transcribe.ts:49,73`

`writeFileSync(wavPath, opts.audio)` and `unlinkSync` block the Node event loop.
Audio can be multiple MB; this stalls *all* concurrent HTTP handling on the
single-threaded server.

**Fix:** use `fs/promises` `writeFile` / `unlink` with `await`.

### 8. Temp-file round-trip vs. in-memory — `transcribe.ts:46-49`

The CLI path writes the WAV to disk so `whisper-cli` can re-read it. The server
path already proves bytes can be handed over without touching disk. This is
inherent to the CLI (it wants a file), but combined with #7 it's the most
expensive part of the cold path. Acceptable since CLI is only the warm-up path —
just make it async.

### 9. No concurrency control → model-load storms / OOM risk

Neither the route nor the provider serializes transcriptions. If multiple
requests land before the server is ready, each spawns its own `whisper-cli`, and
*each reloads the full model* (e.g. `large` ≈ 1.6 GB) from disk into RAM
simultaneously. On a memory-constrained machine that can OOM or thrash. A simple
mutex/queue around the CLI path (or refusing CLI while `startPromise` is
pending) would bound this. There's client-side queueing, but the server
shouldn't rely on it.

### 10. `--threads` never set — `transcribe.ts:51`

whisper.cpp defaults to ~4 threads. On 8–12 core machines, passing `--threads`
(e.g. `Math.min(os.cpus().length, 8)`) measurably speeds CPU inference. The
server is launched without it too (`server.ts:106`). Easy throughput win,
especially for the `medium` / `large` models flagged "Slow".

---

## Minor / notes

- **Greedy decoding is intentional but lossy** (`--beam-size 1 --best-of 1
  --no-fallback`, `transcribe.ts:57-61`): good for latency, but `--no-fallback`
  disables temperature fallback, which can cause repetition/hallucination loops
  on hard audio. Reasonable tradeoff for dictation — just be aware it favors
  speed over accuracy.
- **Orphaned temp files**: a crash between write and `unlink` leaves
  `input-*.wav` in the temp dir forever; there's no startup sweep of
  `freestyle-whisper/`.
- **`audioDurationMs` hardcodes 16 kHz / mono / 16-bit** (transcribe route:52,
  `(len-44)/32`). Correct for the current capture format but silently wrong if
  the WAV format ever changes; only used for analytics.

---

## Suggested first pass

Fix first: **#1 (UTF-8 corruption)** and **#2 (language ignored on server
path)** — both are silent correctness bugs hitting real users (non-English /
non-ASCII dictation), and both are small changes.

Recommended grouping for one focused pass on `transcribe.ts` +
`whisper-local.ts`: **#1, #2, #4, #7, #10**.
