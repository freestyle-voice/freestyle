# Mobile Voice Typing via Freestyle Cloud (v2 streaming)

Status: proposed
Owner: mobile
Related: `freestyle-cloud-auth.md`, cloud repo `apps/server/src/routes/v2/*`

## 1. Goal

Turn `apps/mobile` (the minimal Expo SDK 57 "hello" app) into a real-time
voice-typing app in the spirit of Soniox Voice Typing: hold-to-talk (and
tap-to-toggle), text appears **live as you speak**, clean warm-paper Freestyle
aesthetic, multi-language. Transcription is done **entirely by Freestyle Cloud
on the v2 route** — exactly like the desktop app — not by BYOK provider keys.

The previous `feat/expo-backup` branch implemented BYOK direct-provider batch
transcription (OpenAI/Groq/Deepgram/ElevenLabs). We deliberately drop that: the
clean solution is a single managed cloud backend with real-time streaming.

## 2. How the desktop talks to the cloud (reference contract)

From `apps/server/src/lib/freestyle-cloud.ts` and the cloud repo
`apps/server/src/routes/v2/*` + `apps/server/src/streaming/*`:

- Base URL: `https://service.freestylevoice.com` (`FREESTYLE_CLOUD_URL` override).
- **Auth**: better-auth OAuth 2.0 **Device Authorization Grant**.
  - `POST /auth/device/code` `{ client_id }` → `{ device_code, user_code,
    verification_uri, verification_uri_complete, expires_in, interval }`.
  - User approves at `<cloud>/device` (social sign-in in browser).
  - Poll `POST /auth/device/token` `{ grant_type:
    "urn:ietf:params:oauth:grant-type:device_code", device_code, client_id }`
    → `{ access_token, refresh_token?, expires_in? }`. Errors:
    `authorization_pending` / `slow_down` (keep polling), `access_denied`,
    `expired_token`.
  - `GET /auth/get-session` with `Authorization: Bearer <token>` → user profile.
  - `POST /auth/sign-out` with bearer to revoke.
  - The device plugin does **not** restrict `client_id`, so mobile uses its own
    id `freestyle-mobile`.
- **Batch**: `POST /v2/transcribe` multipart `audio` (WAV) + `language`,
  `appContext`, `skipPostProcess`, cleanup fields → `{ raw, cleaned,
  sttModel, cleanupModel, audioDurationSeconds, usage }`. 401 = auth,
  429 = `{ error, resetsAt }` usage limit.
- **Streaming**: `GET /v2/stream` WebSocket upgrade with `Authorization:
  Bearer <token>`. Proxies to a per-user Durable Object. Protocol:
  - Client → server JSON: `{ type: "start", language?, context?, vocabulary?,
    skipPostProcess?, intensity?, customPrompt?, ...tones }`,
    `{ type: "context", context }`, `{ type: "commit", audioDurationMs?,
    context?, skipPostProcess?, ...tones }`, `{ type: "cancel" }`.
  - Client → server **binary**: raw **PCM16LE, 16 kHz, mono** audio frames.
  - Server → client JSON: `{ type: "config", model, streaming }`,
    `{ type: "session.ready", model }`, `{ type: "partial", text }`,
    `{ type: "final", text }`, `{ type: "error", message, code? }`.
  - On `commit` the DO runs Groq LLM cleanup and returns cleaned text in
    `final` (unless `skipPostProcess`). Billing: 2 credits raw, 3 with cleanup.
  - Soniox upstream config (fixed by the DO): `audio_format: pcm_s16le`,
    `sample_rate: 16000`, `num_channels: 1`.

## 3. Audio capture on mobile (the crux)

Soniox needs raw PCM16/16 kHz/mono. `expo-audio` (SDK 57) ships
**`useAudioStream`** — real-time PCM mic capture:

- `useAudioStream({ sampleRate, channels, encoding, onBuffer })` →
  `{ isStreaming, stream }`.
- Options: `channels` (default 1), `encoding: 'float32' | 'int16'`
  (default float32), `sampleRate` (default 48000, hardware may override),
  `onBuffer(buffer)`.
- `AudioStreamBuffer`: `{ data: ArrayBuffer, sampleRate: number,
  channels: number, timestamp: number }`. For `int16`, `data` is
  little-endian signed Int16 PCM.
- `stream.start()` / `stream.stop()`; needs
  `requestRecordingPermissionsAsync()` first.

**Plan**: request `encoding: 'int16'`, `channels: 1`, `sampleRate: 16000`.
The hardware `buffer.sampleRate` may differ (iOS commonly 48000), so we
**downsample to 16 kHz** in JS before sending each frame to the WS. A simple
linear-interpolation resampler on Int16 is adequate for speech and cheap.
Mono-downmix if `channels > 1`. Frames go straight onto the WebSocket as binary.

This gives the Soniox-style "text appears instantly" experience with a fully
managed cloud backend and no native modules beyond expo-audio.

## 4. Architecture

```
apps/mobile/src
  app/
    _layout.tsx            fonts + splash + providers (auth) — exists, extend
    index.tsx              → redirect to /(app) or /sign-in based on auth
    sign-in.tsx            device-code screen (show user_code, open browser, poll)
    (app)/
      _layout.tsx          authed stack, requires session
      index.tsx            Voice Typing main screen (the hero)
      settings.tsx         language, cleanup toggle, sign out, usage
  components/
    themed-text.tsx        exists
    themed-view.tsx        exists
    mic-button.tsx         animated pulsing record button (Reanimated)
    waveform.tsx           live input-level bars during recording
    transcript-view.tsx    partial (muted) + final (ink) text, live
  constants/theme.ts       exists — extend with radius/etc if needed
  hooks/
    use-theme.ts           exists
    use-auth.ts            auth context: token, user, sign in/out, restore
  lib/
    cloud/
      config.ts            base URL, client id, ws url helper
      device-auth.ts       device code + token polling (fetch better-auth)
      session.ts           GET /auth/get-session, POST /auth/sign-out
      usage.ts             GET /v1/usage
      stream.ts            CloudStreamSession: WS client, start/commit/cancel
    audio/
      recorder.ts          useAudioStream wrapper → onFrame(Int16 @16k mono)
      resample.ts          Int16 linear resampler + mono downmix
    storage.ts             SecureStore token persistence
    settings.ts            AsyncStorage-ish persisted prefs (language, cleanup)
```

State machine for the main screen: `idle → recording → finalizing → idle`
(`error` overlay on failure). While `recording`, we open the WS lazily,
stream frames, render `partial`. On stop we `commit`, wait for `final`,
append to the editable text buffer, and copy/share.

## 5. Cloud client details

- `device-auth.ts`: **reuse the same `better-auth/client` +
  `deviceAuthorizationClient()` plugin the desktop uses** (better-auth 1.6.20,
  already in the workspace). It is pure `fetch`, so it runs in React Native.
  `createAuthClient({ baseURL: "<cloud>/auth", disableDefaultFetchPlugins:
  true, plugins: [deviceAuthorizationClient()] })` then `.device.code({
  client_id })` and `.device.token({ grant_type, device_code, client_id })`.
  Mirror desktop error handling (`authorization_pending`, `slow_down` → backoff
  by `interval`; `access_denied`/`expired_token` → restart). This avoids
  hand-rolling better-auth's wire format.
- Token stored in `expo-secure-store`. On launch, restore token → verify with
  `/auth/get-session`; on 401 clear and route to sign-in.
- `stream.ts`: RN `WebSocket` to `wss://service.freestylevoice.com/v2/stream`.
  RN's WebSocket **does not support custom headers on all platforms** reliably;
  better-auth bearer is required in the `Authorization` header. Verify RN
  `WebSocket(url, protocols, { headers })` passes the header on iOS/Android
  (it does on both native platforms via the options arg). If a platform drops
  it, fall back to a short-lived token query param — but header is the target.
- Send `start` on open, buffer frames until `session.ready`, then flush.
  `commit` with `audioDurationMs`. Deliver `final` to caller.
- Usage limit (`error` code `usage_exceeded` / 429): surface a friendly
  "You've used your free credits" with `resetsAt`.

## 6. Cleanup / language

- Language: a small picker (auto + common set) persisted; sent on `start`.
- Cleanup: default ON (`skipPostProcess: false`, `intensity: "low"`). A toggle
  in settings flips to raw. Tones are desktop-centric (app assignments); mobile
  keeps it simple: just intensity + on/off for v1.

## 7. Dependencies to add (SDK 57 pinned)

`expo-audio`, `expo-secure-store`, `expo-clipboard`, `expo-haptics`,
`expo-web-browser`, `@react-native-async-storage/async-storage` (or
expo-sqlite/kv), plus `better-auth` (client only) for the device-auth flow.
Expo packages via `npx expo install` to get SDK-57-correct versions.
`app.json`: add `expo-audio` plugin with mic permission + `expo-secure-store`,
iOS `NSMicrophoneUsageDescription`, Android `RECORD_AUDIO`.

## 8. Build & verification loop

1. Install deps, wire `app.json`, scaffold files.
2. `pnpm --filter mobile exec tsc --noEmit` until clean.
3. `pnpm --filter mobile exec expo lint` (biome) until clean.
4. `npx expo-doctor` / `expo config` sanity where possible in CI-less env.
5. Iterate: type errors, unused imports, RN API misuse (e.g. WS headers),
   resampler correctness, state-machine edge cases (double start, empty final).
6. deslop the diff, commit, push to `feat/expo`.

## 9. Non-goals (v1)

- No iOS keyboard/Share Extension/Widget (that was the backup branch's scope).
- No BYOK provider keys — cloud only.
- No local on-device models.
- No offline mode (cloud requires connectivity, like Soniox).

## 10. Risks / open questions

- RN WebSocket custom-header support per platform (mitigation: query-param
  token fallback).
- Actual delivered `sampleRate` from `useAudioStream` on real devices →
  resampler must read `buffer.sampleRate`, not assume.
- `reactCompiler: true` + Reanimated worklets interplay on SDK 57.
- We cannot run a device/simulator here; correctness is enforced via strict
  TypeScript against the documented SDK 57 types + lint, and by mirroring the
  desktop's proven WS protocol exactly.
