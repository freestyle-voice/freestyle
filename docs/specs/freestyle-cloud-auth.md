# Technical Spec: Freestyle Cloud Sign-In (Desktop / Client)

**Status:** Draft / Proposal
**Date:** 2026-06-21
**Scope:** `apps/electron` (main + renderer) and `apps/server` (embedded) — device-flow sign-in and attaching the token to managed STT calls
**Sibling spec:** `cloud/docs/desktop-oauth-auth.md` (backend half). §5 there is the shared interface.

---

## 1. Goal

Let a user sign in to **Freestyle Cloud** from the desktop app via Google, store the session token securely, and attach it as `Authorization: Bearer <token>` on every managed `/v1/transcribe` call — so the cloud provider works only when signed in. Sign-in uses the **OAuth Device Authorization Grant** through our Better Auth backend, which creates the user (with email/name) in Cloudflare D1.

The service is **free**; sign-in is for identity/abuse-gating only.

### Non-goals
- Billing / plan UI.
- Auth for local (on-device) transcription — "Private" stays keyless and offline. This only affects the **Freestyle Cloud** provider.
- Account management beyond sign-in / signed-in identity / sign-out.

---

## 2. Background — current state

- **Main** (`apps/electron/src/main/index.ts`): creates the pill + settings windows, uses `shell.openExternal`, registers a privileged `app://` scheme for the renderer. **No** `safeStorage`/keytar yet. Starts the embedded server via `startFreestyleServer({ port, host })`, setting `process.env.*` first.
- **Embedded server** (`apps/server`, Node/Hono): runs transcription; the `freestyle-cloud` provider calls the cloud.
- **Renderer**: talks to the embedded server via `getClient()` (`apps/electron/src/renderer/src/lib/api.ts`). **No** existing login/account UI or Better Auth client.
- **Provider today** (`apps/server/src/lib/streaming/providers/freestyle-cloud.ts`): POSTs WAV with **no auth header**; marked keyless in `streaming-stt.ts` (`getApiKeyForProvider` returns `"local"`). The transcribe route passes `getApiKeyForProvider(provider)` as `opts.apiKey`.
- **Persistence**: embedded SQLite `settings` (key/value, REST at `/api/settings/:key`) and `api_keys`; shared `SETTINGS_KEYS`. Onboarding (`onboarding.tsx`): `permissions → language → tutorial`.

---

## 3. The problem

The cloud endpoint is being gated behind a signed-in user (sibling spec). The desktop app must: run an OAuth flow without a browser cookie, store the token **securely** (no plaintext/SQLite), get it to the **embedded server** (which makes the cloud call — not the renderer), and gate the Freestyle Cloud provider on being signed in.

---

## 4. Chosen approach — Device Authorization Grant

The **main process** runs the device flow against Better Auth's `deviceAuthorization` plugin (sibling §4–5): request a device code, open the browser to the approval page, poll for the token. No localhost server, no PKCE to hand-roll. The renderer triggers it over IPC; the main process owns the token and pushes it into the embedded server, where the provider attaches it.

**Identity:** approval happens via a real Google sign-in in the browser, so the returned session is a full user — the app reads `email`/`name`/`image` from `GET /v1/me`.

### 4.1 Main-process device-flow module (`apps/electron/src/main/cloud-auth.ts`, new)
On `signIn()`:
1. `POST ${CLOUD_URL}/auth/device/code` → `{ user_code, verification_uri_complete, interval, expires_in, device_code }`.
2. `shell.openExternal(verification_uri_complete)` (browser opens the dashboard approval page with the code pre-filled). Surface the `user_code` in-app too, as a fallback.
3. **Poll** `POST ${CLOUD_URL}/auth/device/token { device_code, grant_type, client_id }` every `interval` seconds, honoring `slow_down`; stop on `access_denied`/`expired_token`/timeout (`expires_in`).
4. On success → `{ access_token, expiresAt }`. Fetch `GET /v1/me` for the profile. Persist (§4.2), push to the embedded server (§4.3), resolve the IPC promise with `{ user }`.

`CLOUD_URL` resolves like the provider's base URL (`FREESTYLE_CLOUD_URL` env override → hosted default), keeping local-dev and prod consistent.

### 4.2 Secure token storage (OS keychain)
Use Electron **`safeStorage`** (added here). Store `safeStorage.encryptString(token)` plus `{ expiresAt, user }` in `userData/cloud-auth.json` (token field encrypted, base64). On launch, decrypt and validate via `GET /v1/me`; on `401`/expired, treat as signed out. **Never** write the token to SQLite `settings`/`api_keys`.

### 4.3 Getting the token to the embedded server
The provider runs in the embedded server, so it needs the token in-memory (not the renderer's bearer seam, which is renderer→server). Add:
- `apps/server/src/lib/cloud-auth.ts` (new): module-level `getCloudAuthToken()` / `setCloudAuthToken(token | null)`.
- `startFreestyleServer({ …, cloudAuthToken })`: seed at startup (main passes the decrypted token).
- `PUT /api/cloud-auth { token | null }` (new internal route; server binds `127.0.0.1` only): main updates the token after sign-in/out without a restart.

### 4.4 Provider + key seam
- Remove `freestyle-cloud` from `KEYLESS_STT_PROVIDERS` (`streaming-stt.ts`).
- `getApiKeyForProvider`: `if (providerId === FREESTYLE_CLOUD_PROVIDER_ID) return getCloudAuthToken();` (→ `null` when signed out).
- Transcribe route's "no key configured" branch becomes the **signed-out** path → return a typed `{ error: "cloud_auth_required" }` so the renderer prompts sign-in.
- `freestyle-cloud.ts` `transcribe()`: set `headers["authorization"] = `Bearer ${opts.apiKey}``; on a `401` response throw a typed `CloudAuthError` so the app invalidates the session and re-prompts.

### 4.5 Renderer UX
- **IPC** (preload): `cloudSignIn(): Promise<{ user }>`, `cloudSignOut(): Promise<void>`, `getCloudUser(): Promise<User | null>`.
- **Account section** in Settings: signed-out → "Sign in to Freestyle Cloud"; signed-in → name/email/avatar + "Sign out".
- **Sign-in pending state**: after `cloudSignIn()` opens the browser, show "Waiting for approval in your browser… (code: ABCD-1234)" with a cancel.
- **Onboarding**: optional `"cloud"` step offering sign-in (skippable — local transcription works without it).
- **Gate at point of use**: selecting **Freestyle Cloud** in the voice picker while signed out starts sign-in first; a `cloud_auth_required`/`CloudAuthError` at transcribe time surfaces a "Sign in to use Freestyle Cloud" prompt rather than a silent failure.

### 4.6 Sign-out
Main calls `POST ${CLOUD_URL}/auth/sign-out` with the bearer token, clears `cloud-auth.json`, and `PUT /api/cloud-auth { token: null }`.

---

## 5. Changes by file

| Area | File | Change |
|---|---|---|
| Device-flow driver | `apps/electron/src/main/cloud-auth.ts` *(new)* | request code, open browser, poll token, safeStorage |
| IPC wiring | `apps/electron/src/main/index.ts`, `src/preload/index.ts` | `cloudSignIn/Out`, `getCloudUser`; pass `cloudAuthToken` to `startFreestyleServer`; push updates |
| Server token store | `apps/server/src/lib/cloud-auth.ts` *(new)* | in-memory get/set |
| Server option + route | `apps/server/src/index.ts` (start opts), new `PUT /api/cloud-auth` | seed + update token |
| Key seam | `apps/server/src/lib/streaming-stt.ts` | drop `freestyle-cloud` from keyless; return token |
| Provider | `apps/server/src/lib/streaming/providers/freestyle-cloud.ts` | attach `Authorization: Bearer`; typed 401 |
| Transcribe error | `apps/server/src/routes/transcribe.ts` | signed-out → `cloud_auth_required` |
| Renderer UI | settings account section, onboarding step, voice-picker gate | sign-in/out + gating |

---

## 6. Security considerations

- **Token at rest** only in the OS keychain via `safeStorage` — never SQLite, logs, or renderer `localStorage`.
- **No secret in a URL**: only the human-readable `user_code` is shown; the token arrives over the polled, TLS-protected `device/token` call.
- **Renderer isolation**: the raw token stays in main + embedded server; the renderer only ever sees the *user profile*. Don't expose a `getCloudToken` to the renderer.
- **Embedded server is loopback-bound** (`127.0.0.1`), so `PUT /api/cloud-auth` isn't remotely reachable.
- **Poll hygiene**: respect `interval`/`slow_down`/`expires_in`; cancel cleanly; no infinite retry on `access_denied`.
- **Re-auth**: a `401`/`CloudAuthError` from the cloud invalidates the stored session and prompts sign-in.

---

## 7. Testing

- **Server unit (vitest)**: `getApiKeyForProvider("freestyle-cloud")` returns the in-memory token / `null`; provider sets the bearer header (mock `fetch`); a mocked `401` raises `CloudAuthError`.
- **Main unit**: device-flow polling (pending → approved via a mock backend); honors `slow_down`/timeout; cancel works.
- **Manual E2E**: `wrangler dev` (cloud) + `pnpm dev` (desktop) → sign in → approve in the dashboard → confirm a `users` row is created in D1, `/v1/me` shows the email, dictation via Freestyle Cloud succeeds; sign out → cloud transcription is blocked with the sign-in prompt. Remember the embedded server loads from `dist/` — rebuild + restart after `apps/server` changes.

---

## 8. Rollout / phasing

Mirrors the backend phases. **P1**: backend (plugins + approval page) ships while `/v1/transcribe` stays open. **P2**: land this client half — sign-in works and attaches the bearer, but transcription still succeeds anonymously, so we can dogfood without stranding anyone; gate the provider in the UI here. **P3**: backend flips on `isAuthenticated()`, shipped alongside a desktop release that signs users in first.

---

## 9. Open questions

- **Token refresh**: honor a refreshed `set-auth-token` response header to extend sessions silently, or re-prompt on expiry?
- **Onboarding placement**: first-run step vs purely on-demand when Freestyle Cloud is first selected? (Leaning on-demand, since "Private" is the privacy-first default.)
- **`user_code` visibility**: rely on `verification_uri_complete` (pre-filled) alone, or always show the code in-app as a fallback? (Leaning: show it, for robustness.)
- **Multiple installs**: out of scope for v1 (one token per machine, stored locally).
