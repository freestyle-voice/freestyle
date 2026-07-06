# Freestyle Voice Keyboard (iOS keyboard extension)

Status: in progress — **Phases 1–4 implemented** (live dictation end-to-end;
awaits on-device validation)
Owner: mobile
Related: `mobile-cloud-voice-typing.md`, cloud `apps/server/src/routes/v2/*`

Progress:
- [x] **Phase 1** — `plugins/withKeyboardExtension.js` adds the
  `FreestyleKeyboard` app-extension target (App Group, Full-Access request, mic
  usage string, embed). Voice panel shell.
- [x] **Phase 2** — Full-Access gate (`hasFullAccess`) + `AudioEngineCapture`
  (`AVAudioEngine` tap → `AVAudioConverter` → PCM16/16k/mono frames + level) +
  `textDocumentProxy` insertion on commit.
- [x] **Phase 3** — session sharing via the **App Group** (not keychain): a
  local Expo module `freestyle-shared-store` writes the bearer session token +
  cloud URL + prefs from JS (`src/lib/keyboard-bridge.ts`), read in Swift by
  `SharedStore.swift`. Synced on session/settings change.
- [x] **Phase 4** — `CloudStreamSession.swift` (`URLSessionWebSocketTask`
  `/v2/stream`, bearer auth, start/commit/cancel, partial/final) with live
  partials in-panel → committed `final` inserted. `CloudTranscriber.swift`
  (batch `POST /v2/transcribe`) ships as a ready client; auto-wiring the
  fallback (buffer audio to file) is a deliberate follow-up.
- [x] In-app setup screen `src/app/(app)/keyboard-setup.tsx` +
  `freestyle://keyboard-setup` deep link (from the extension's Full-Access
  prompt) and a Settings entry point.

### Decision update (supersedes §5)

Session sharing uses the **App Group `UserDefaults`** container, not a keychain
access group. Rationale: `expo-secure-store`'s `accessGroup` needs the Apple
**Team ID** (`AppIdentifierPrefix`) as a literal at runtime, which isn't
configured and complicates provisioning. The App Group is sandboxed to
Freestyle's own two targets, needs no Team ID, and works on any provisioning.
The token is still a short-lived bearer session token treated as 401-on-expiry.

## Decisions (locked)

- **Backend**: real-time **streaming** (`WSS /v2/stream`) with a **batch
  fallback** (`POST /v2/transcribe`) when the socket can't open. (§4)
- **Partials UX**: v1 shows live partials in the keyboard's **status strip**;
  only the committed **final** is inserted into the host field. In-field
  partials (delete/insert diffing) are a later upgrade. (§7)
- **Layout**: **minimal** — mic + globe + space + delete + return. No QWERTY in
  v1; users switch to the system keyboard for manual typing. (§1)
- **Platform**: **iOS only** for v1. Android (`InputMethodService`) is a
  separate follow-up. (§10)
- **Auth**: better-auth **bearer session token** shared via a keychain access
  group; non-secret prefs via the App Group. (§5)

## 1. Goal

A **system-wide iOS keyboard** with a mic button so users can dictate into
**any** app's text field (Messages, Mail, Notes, Safari…) — the Soniox "type
anywhere with your voice" experience. Transcription goes through **Freestyle
Cloud v2**, reusing the main app's signed-in session. Text is inserted directly
into the host app's active text field.

Non-goal for v1: a full QWERTY layout. We ship a **minimal** keyboard (mic +
globe/switch + space + delete + return); users switch to the system keyboard
for manual typing. This keeps the extension small and focused.

Platform: **iOS first**. Android (`InputMethodService`) is a follow-up.

## 2. Prior art (backup branch)

`feat/expo-backup` scaffolded a working keyboard (commits `8ff7c70` →
`41eeb47`), then **removed it** (`8d47a55`) in favour of a Share
Extension/Widget/Siri. We reuse its proven structure but change the backend:

- `plugins/withKeyboardExtension.js` — Expo config plugin that adds a
  `FreestyleKeyboard` app-extension target to the Xcode project during
  prebuild, wires App Groups, entitlements, Info.plist, and embeds the
  `.appex`. **Reusable almost as-is.**
- `ios-keyboard/KeyboardViewController.swift` — mic/globe/space/delete/return
  UI, dark-mode aware. **Reusable, retitle + restyle to current design.**
- `ios-keyboard/AudioRecorder.swift` — `AVAudioRecorder` → m4a. **Reused only
  for the batch fallback**; the streaming path adds `AVAudioEngine` capture.
- `ios-keyboard/TranscriptionService.swift` — **replaced**: was BYOK
  (OpenAI/Groq/…); becomes Freestyle Cloud v2 clients — `CloudStreamSession`
  (WS `/v2/stream`) plus a `CloudTranscriber` batch fallback (`/v2/transcribe`).
- `ios-keyboard/SharedConfig.swift` — App Group `UserDefaults` bridge.
  **Repurposed**: instead of API keys, it reads the cloud session + prefs.

## 3. Hard iOS constraints (design drivers)

1. **Memory ceiling ~60–70 MB.** The extension is killed if it exceeds it.
   → We stream (per the decision), so we must be strict: native audio only, no
   whole-recording buffering, a small reusable conversion buffer, and prompt
   teardown of the engine + socket. Batch is the fallback. Profile with
   Instruments before shipping. (See §4 memory discipline.)
2. **"Allow Full Access" required** for mic + network. Without it, the
   extension is sandboxed with no network/mic. We must detect this
   (`hasFullAccess`) and show an inline "Enable Full Access in Settings"
   prompt. This is an explicit, scary-sounding user step — unavoidable for any
   voice keyboard.
3. **Separate process, no Expo/JS runtime.** The extension is **native Swift
   only** — it cannot call our TS cloud client. All cloud logic (WebSocket
   streaming + batch POST) is reimplemented in Swift.
4. **No direct access to the app's JS state.** Config crosses the process
   boundary via an **App Group** (`group.com.freestylevoice.app`).

## 4. Backend: streaming v2 (chosen) with batch fallback

Decision (user): the keyboard uses **real-time streaming** (`WSS /v2/stream`)
so text appears live as you speak, matching the standalone app and Soniox.
Batch (`POST /v2/transcribe`) is kept as a **fallback** when the socket fails
or Full Access/network is flaky.

### Streaming path (native Swift, no `ws`/JS)
- **Audio capture**: `AVAudioEngine` input tap → convert to **PCM16, 16 kHz,
  mono** with `AVAudioConverter` (Soniox's required format). Native conversion
  is far lighter than the RN resampler; feed frames straight to the socket.
- **WebSocket**: `URLSessionWebSocketTask` to `wss://…/v2/stream` with
  `Authorization: Bearer <sessionToken>` header. Mirror the app's protocol
  exactly: send `{type:"start", language, skipPostProcess, intensity}` on open,
  stream binary PCM frames, `{type:"commit", audioDurationMs}` on stop; receive
  `session.ready` / `partial` / `final` / `error`.
- **Live insertion**: render `partial` by diffing against the last inserted
  text — delete the previous partial's characters via `deleteBackward()` and
  `insertText()` the new one, so the host field updates live. On `final`,
  settle the text. (Simpler v1: show partials in the keyboard's own status
  strip and only `insertText` the committed `final` — avoids fighting host-app
  autocorrect. Start here, upgrade to in-field partials if it feels good.)
- Auth is the better-auth **bearer session token** (simplest cross-process —
  no cookie jar). 401 → "open Freestyle to sign in"; 429 → "out of credits".

### Batch fallback
`POST /v2/transcribe` multipart (`AVAudioRecorder` m4a) → insert `cleaned`.
Used when the WS can't open or errors before `session.ready`.

### Memory discipline (critical — see §3)
- Stream frames immediately; **never buffer** the whole recording.
- Use a small fixed-size scratch buffer for conversion; reuse it.
- Tear down `AVAudioEngine` + WS on stop/dismiss; release on `didReceiveMemoryWarning`.
- No JS runtime, no image assets — keep the extension lean. Profile with
  Instruments (Allocations + the ~60–70 MB jetsam limit) before shipping.

## 5. Auth sharing (main app → extension)

The extension needs a credential to call the cloud. Two viable channels:

- **Preferred: keychain access group.** `expo-secure-store` supports
  `accessGroup`. Store a **bearer session token** under a shared access group
  (`$(AppIdentifierPrefix)com.freestylevoice.app.shared`) that both the app
  target and the keyboard target can read. The extension reads it directly from
  the keychain in Swift.
- **Alternative: App Group UserDefaults.** Simpler to wire but less secure for
  a credential (UserDefaults isn't encrypted at rest the way keychain is). Use
  App Group **only** for non-secret prefs (language, cleanup on/off, base URL,
  onboarding/full-access hints).

Decision: **session token in the shared keychain access group; prefs in the App
Group UserDefaults.** The app writes both on sign-in / settings change; a small
native module (or `expo-secure-store` `accessGroup` + a tiny UserDefaults
bridge) performs the writes.

Token lifetime: better-auth session tokens are long-lived but can expire /
be revoked. The extension treats 401 as "not signed in" and shows a prompt to
open the app. The app refreshes the shared token on launch and on
`useSession()` changes.

## 6. Components / files

```
apps/mobile/
  app.json                         add withKeyboardExtension plugin + appGroup
  plugins/
    withKeyboardExtension.js       Xcode target, App Group, entitlements, embed
                                   (ported from backup, bundle ids updated)
  ios-keyboard/
    KeyboardViewController.swift   minimal keyboard UI (mic/globe/space/del/return),
                                   full-access gate, recording/streaming/inserting states
    AudioEngineCapture.swift       AVAudioEngine tap + AVAudioConverter → PCM16/16k/mono
                                   frames (+ level for the orb)
    CloudStreamSession.swift       URLSessionWebSocketTask client for /v2/stream
                                   (start/commit/cancel, partial/final), bearer token
    CloudTranscriber.swift         batch fallback: POST /v2/transcribe (AVAudioRecorder m4a)
    SharedStore.swift              read session token (keychain group) + prefs
                                   (App Group UserDefaults)
  src/lib/keyboard-bridge.ts       JS: on sign-in / settings change, write the
                                   session token (SecureStore accessGroup) and
                                   prefs (App Group) so the extension stays in sync
  src/app/(app)/keyboard.tsx       in-app setup screen: how to enable the
                                   keyboard + Full Access, live status
```

Config additions (`app.json`):
- iOS `entitlements`: `com.apple.security.application-groups`
  = `["group.com.freestylevoice.app"]`; keychain-access-groups for the shared
  token.
- The plugin adds the keyboard target with `RequestsOpenAccess = true`,
  `NSMicrophoneUsageDescription`, App Group + keychain entitlements, deployment
  target 16.0.

## 7. UX / states (KeyboardViewController)

### Layout — Soniox voice panel (reference: soniox.com/soniox-app/voice-typing)

The keyboard is a **single voice panel**, not a QWERTY grid. It fills the
standard keyboard area and reads text-first:

```
┌───────────────────────────────────────────────┐
│  (✕)                                     (✓)    │  ← cancel / commit
│                                                 │
│        Pouvez-vous me donner une recette         │  ← live transcription
│              de déjeuner rapide ?                │     (centered, large)
│              · · · · · · · · ·                  │  ← thin waveform (level-driven)
│                  listening…                     │  ← status (muted)
│                                                 │
│            unstyled transcription               │  ← raw/cleaned mode label
│  (⊕)                                            │  ← globe: switch keyboards
└───────────────────────────────────────────────┘
```

- **Cancel (✕, top-left)** — discard the utterance, insert nothing, back to
  idle. Light circular button.
- **Commit (✓, top-right)** — stop + finalize; insert the committed text into
  the host field. Dark filled circular button (primary action).
- **Live transcription (center)** — the interim/`partial` text, large and
  centered, updating as you speak. This is the hero of the panel (Soniox shows
  the sentence forming here, not in the host field, until commit).
- **Waveform** — a thin row of level-driven bars just under the text (reuse the
  app's `Waveform` behavior), giving "it's listening" feedback.
- **Status** — muted `listening…` while streaming; `polishing…` while the
  cloud cleans on commit.
- **Mode label** — small centered micro-label at the bottom: `unstyled
  transcription` when cleanup is off, otherwise e.g. `neutral tone` (reflects
  the shared cleanup/tone prefs). Tapping it is a future shortcut to toggle.
- **Globe (⊕, bottom-left)** — `advanceToNextInputMode()` to switch keyboards.
- **Auto-start**: because the whole panel is the voice surface, streaming can
  begin as soon as the keyboard appears (and Full Access is granted), matching
  Soniox's "hold fn"/instant model. v1: start on first appearance or on a
  center tap; ✓ commits, ✕ cancels. (Decide during Phase 2.)

### States

- **No Full Access** → replace the panel body with a short message + a button
  deep-linking to Settings; no mic/network attempted.
- **Idle** (pre-start) → dim placeholder ("Tap to speak") + globe.
- **Streaming** → live text + animated waveform + `listening…`; ✓/✕ active.
- **Finalizing** → `polishing…`; on `final`, `insertText(final)` into the host
  field, then reset.
- **Errors**: 401 → "Open Freestyle to sign in"; 429 → "Out of credits";
  network → transient inline message. Never crash the host app.
- Respect light/dark via `traitCollection`. The reference uses a neutral
  light-grey panel with a dark primary (✓) accent; we map that to Freestyle's
  paper/ink with the olive/red accent on the active waveform + commit button.

### Insertion model (v1)

Show partials **inside the panel** (not the host field) and only
`textDocumentProxy.insertText(final)` on commit. This avoids fighting host-app
autocorrect and matches Soniox's panel-first flow. In-field live partials
(delete/insert diffing) remain a later upgrade (§5 of phasing).

### Visual direction (Soniox-inspired — soniox.com/soniox-app/voice-typing)

The Soniox keyboard reads as calm and single-purpose: a large centered mic
control with a live waveform that reacts to speech, minimal chrome, and text
appearing instantly. We adopt the same restraint within Freestyle's language:

- **Centerpiece mic** — one prominent circular mic button, centered, with a
  soft colored halo/pulse that swells with the live input level (mirrors the
  standalone app's redesigned `MicButton`). Olive when idle, warm red while
  recording.
- **Live waveform strip** — a thin row of level-driven bars above/around the
  mic (mirrors the app's `Waveform`), giving immediate "it's listening"
  feedback. This doubles as the v1 partials location: show interim text in a
  single-line strip beneath the waveform, commit `final` into the host field.
- **Minimal keys** — mic + globe + space + delete + return only; generous
  spacing, no busy QWERTY grid. Rounded, pill-like keys consistent with the
  app's `Radius.full` buttons.
- **Typography** — JetBrains Mono uppercase micro-labels for status
  ("LISTENING", "POLISHING"), matching the app. Keep color usage sparse:
  paper/ink neutrals with the olive/red accent only on the mic + active bars.
- **Motion** — reuse the app's motion vocabulary (breathing halo, flowing
  bars) so the keyboard feels like the same product, not a bolt-on.

Reuse the standalone app's redesigned `MicButton`/`Waveform`/`icons` as the
visual reference when porting to Swift (`AVAudioEngine` level → the same
halo/bar behavior).

## 8. Build & test

- Native-only: requires `expo prebuild` + a **dev client / EAS build**. Does
  **not** run in Expo Go.
- Manual QA on device: enable keyboard in Settings → Keyboards, enable Full
  Access, dictate into Messages/Notes/Safari.
- Verify: token sharing (sign in app → keyboard works without re-auth), 401
  after sign-out, 429 message, dark mode, memory (watch for jetsam) via
  Instruments.
- Since we can't run a simulator here, correctness is limited to: config-plugin
  prebuild succeeds, Swift compiles, and the cloud contract matches
  `/v2/transcribe`. Real validation needs a device build by the user.

## 9. Risks / open questions

- **Full Access friction**: the biggest UX hurdle; unavoidable. Mitigate with a
  clear in-app setup screen.
- **Memory**: even batch must be careful (release the recorder + audio buffer
  promptly). If we later want live partials, profile headroom first.
- **Apple review**: voice keyboards with network access get scrutiny; the
  privacy string + a clear purpose help. Not a code issue but a release one.
- **Token security**: keychain access group is the right call; confirm the
  `AppIdentifierPrefix` (team id) is available to the plugin at prebuild.
- **Android**: entirely separate (`InputMethodService`); out of scope for v1.

## 10. Phasing

1. Port `withKeyboardExtension.js`; get an **empty** keyboard building + showing
   in a dev client (no mic yet). Prove the plugin/prebuild/embed pipeline.
2. Add Full-Access gate + `AudioEngineCapture` + insert a hardcoded string on
   mic tap. Prove mic + text insertion.
3. Add `SharedStore` + `keyboard-bridge.ts` token/prefs sync. Prove the
   extension reads the app's session.
4. Add `CloudStreamSession` (`/v2/stream`) end-to-end with partials in the
   status strip → committed `final` inserted. Prove live dictation.
   Add `CloudTranscriber` batch fallback for socket failures.
5. (Optional) live in-field partials via delete/insert diffing.
6. Polish states/theme, error handling, in-app setup screen; profile memory.
7. (Later) Android keyboard (`InputMethodService`).
