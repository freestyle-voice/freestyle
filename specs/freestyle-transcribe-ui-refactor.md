# Overview 

We built Freestyle Transcribe, the end-to-end cloud transcription pipeline that we built. The objective is that we want freestyle transcribed to be the default service that is configured when someone logs in or creates an account on freestyle. 

Here are some of the behaviors that we want: 
1. When someone signs in, we automatically switch them over to using Freestyle Transcribe every time. Freestyle transcribe should be the default service when logged in.
2. They can still choose to switch off a Freestyle transcribe at any time.
3. If they're signed in and they decide to choose another model that is not Freestyle Transcribe, of course we want to persist that. 

# Instructions
1. Investigate: currently, how do we select default models? Look at what models are currently selected as the default models and if we automatically switch to freestyle transcribe when someone signs in.
2. Investigate our current behaviors around logins and models selected.
3. Write a technical spec on the findings as well as any technical changes that we need to make to enforce the behaviors that we want.

---

# Technical Spec: Make Freestyle Transcribe the Default Service When Signed In

## 1. Goal

When a user is signed in to their Freestyle account, **Freestyle Transcribe** should be their transcription service by default. Concretely:

- **B1.** Signing in switches the default transcription service to Freestyle Transcribe.
- **B2.** The user can switch away from Freestyle Transcribe at any time while signed in.
- **B3.** A signed-in user's explicit choice of a non-Freestyle model is persisted (we don't keep forcing them back).

## 2. Terminology

- **Service / provider** — `freestyle-cloud` is the internal provider ID (unchanged); "Freestyle Transcribe" is the user-facing name (rename landed in `ee403a3`).
- **Default voice model** — the row in `model_configs` with `type='voice' AND is_default=1`. This is what "the transcription service" means concretely. There is one default per type (`voice`, `llm`).
- **Sign-in** — completing the OAuth device-code flow (`POST /api/auth/device/token` succeeds and `setSession()` is called). This is the only place a session is created.

## 3. Findings — Current Behavior

### 3.1 How models are identified and stored
- A model is the pair `(provider, model_id)`, where `model_id` is `provider/short-id` (e.g. `freestyle-cloud/stt`). Constants: `apps/server/src/lib/freestyle-cloud.ts:6-8`.
- Persisted in SQLite table **`model_configs`** (`apps/server/src/lib/schema.ts:170-180`): `UNIQUE(provider, model_id, type)`, `type IN ('voice','llm')`, `is_default INTEGER`.
- The selected service = `SELECT ... WHERE type='voice' AND is_default=1` (`getDefaultModels()`, `apps/server/src/lib/providers.ts:92-114`). Setting a default first unsets any prior default of that type (`apps/server/src/routes/models.ts:452-457`, `485-504`).
- Related toggles live in the `settings` table (`llm_cleanup`, etc.), keyed by `SETTINGS_KEYS` in `apps/electron/src/shared/settings-keys.ts`.

### 3.2 What the current default is
- **There is no hardcoded default.** `getDefaultModels()` returns `voice: null` if no `is_default` row exists, and transcription errors out (`apps/server/src/routes/transcribe.ts:91-92`).
- The default is established during **onboarding**, which steers a fresh user to a **local** engine: `RECOMMENDED_MLX_DEF = "qwen3-0.6b-8bit"` (Apple Silicon) / `RECOMMENDED_WHISPER_DEF = "small-q5_1"` (fallback) — `apps/electron/src/renderer/src/onboarding.tsx:95-96`.
- Freestyle Transcribe becomes the default **only if the user explicitly picks it** during onboarding — `commitFreestyleCloudDefault()` (`onboarding.tsx:377-401`), which POSTs to `/api/models/configured` with `is_default:true`.

### 3.3 Sign-in / sign-out flow
- OAuth 2.0 **device authorization grant** via `better-auth`. Renderer `signIn()` (`apps/electron/src/renderer/src/lib/auth-context.tsx:56-119`) → `POST /api/auth/device/code` → open browser → poll `POST /api/auth/device/token`.
- On success the backend calls **`setSession(...)`** and `identifyCloudUser(user)` — `apps/server/src/routes/auth.ts:46-54`. `setSession` is the **only** session write and is called **only** here (verified: no token-refresh path re-calls it; sessions simply expire and auto-invalidate in `getSession()`, `sessions.ts:66-69`).
- Sign-out: `POST /api/auth/sign-out` → `signOutCloud()` + **`invalidateSession()`** (`auth.ts:72-79`).

### 3.4 The key asymmetry (root cause)
- **Sign-out already changes model selection.** `invalidateSession()` (`sessions.ts:53-57`) fans out to **`revertFreestyleCloudDefaults()`** (`apps/server/src/lib/freestyle-cloud-defaults.ts`), which — if the default voice provider is `freestyle-cloud` — flips the default to the most recent local voice model and forces `llm_cleanup='false'`.
- **Sign-in does NOT have a symmetric "apply".** Nothing server-side switches the default to Freestyle Transcribe on sign-in. It only happens via explicit UI commits (onboarding `commitFreestyleCloudDefault`, or the settings page `useFreestyleCloudFor*` / `onPickCloud` handlers in `apps/electron/src/renderer/src/pages/models/index.tsx:86-139`).

**Conclusion:** B1 is currently unmet outside of onboarding's explicit-pick path. B2 and B3 are already satisfied by the existing `POST /configured` flow. The fix is to add the missing sign-in-side "apply", mirroring the existing sign-out-side "revert".

## 4. Design

### 4.1 Resolving the B1↔B3 tension
"Switch to Freestyle Transcribe every time on sign-in" (B1) and "persist a signed-in user's non-Freestyle choice" (B3) conflict only if interpreted continuously. We resolve it by scoping the auto-switch to the **sign-in transition (event)**, not a continuous invariant:

- On the **sign-in event**, set the default voice model to Freestyle Transcribe (B1).
- **While signed in**, if the user picks another model, it persists via the existing `POST /configured` path — we do nothing to override it (B3). The user can also switch away at any time (B2).
- A subsequent explicit **sign-out → sign-in** cycle will switch back to Freestyle Transcribe. This is the intended reading of "every time they sign in."

This is safe because `setSession()` is invoked only on genuine sign-in (no refresh path), so the event maps 1:1 to an explicit user sign-in.

> **Decision to confirm:** whether re-signing-in should override a *previously chosen* local model. Recommendation: **yes** — matches the literal "default service when logged in" and keeps the model symmetric with sign-out. If product prefers "only switch on the *first* sign-in / only if the user never chose otherwise," we'd need a persisted `user_has_overridden_default` flag in `settings` and gate the apply on it (see §6, Alt-A).

### 4.2 Scope: voice + cleanup, together
Freestyle Transcribe is treated as **one bundle**: on sign-in we set **both** defaults to Freestyle and turn cleanup on:
- voice default → `freestyle-cloud/stt` ("Freestyle Transcribe")
- llm default → `freestyle-cloud/post-process` ("Freestyle Transcribe Cleanup")
- `settings.llm_cleanup` → `'true'`

This is the exact server-side mirror of the settings-page "Use Freestyle for both" action (`useFreestyleCloudForBoth`, `apps/electron/src/renderer/src/pages/models/index.tsx:86-94`: `configureModel(voice)` + `configureModel(cleanup)` + `setCleanup(true)`), and it makes apply the full inverse of the existing sign-out revert (which flips voice to local **and** forces `llm_cleanup='false'`). B2/B3 still hold per §4.1 for both the voice and the cleanup default independently.

## 5. Technical Changes

### 5.1 Backend — add `applyFreestyleCloudDefaults()` (mirror of the revert)
**File:** `apps/server/src/lib/freestyle-cloud-defaults.ts`

Add a function that makes Freestyle Transcribe the default for **both** the voice model and the cleanup LLM, and enables cleanup — creating the rows if they don't exist yet (a fresh user may have no `freestyle-cloud` rows). This is the full inverse of `revertFreestyleCloudDefaults()`.

```ts
export function applyFreestyleCloudDefaults(): void {
  const db = getDb();

  const setDefault = (modelId: string, modelName: string, type: "voice" | "llm") => {
    db.prepare("UPDATE model_configs SET is_default = 0 WHERE type = ?").run(type);
    db.prepare(
      `INSERT INTO model_configs (provider, model_id, model_name, type, is_default)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(provider, model_id, type) DO UPDATE SET is_default = 1`,
    ).run(FREESTYLE_CLOUD_PROVIDER_ID, modelId, modelName, type);
  };

  setDefault(FREESTYLE_CLOUD_TRANSCRIBE_MODEL_ID, "Freestyle Transcribe", "voice");        // freestyle-cloud/stt
  setDefault(FREESTYLE_CLOUD_CLEANUP_MODEL_ID, "Freestyle Transcribe Cleanup", "llm");     // freestyle-cloud/post-process

  // Turn on the cleanup step (inverse of the revert forcing it 'false').
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('llm_cleanup', 'true', datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = datetime('now')`,
  ).run();
}
```

Notes:
- Reuses `FREESTYLE_CLOUD_PROVIDER_ID` / `FREESTYLE_CLOUD_TRANSCRIBE_MODEL_ID` / `FREESTYLE_CLOUD_CLEANUP_MODEL_ID` already exported from `freestyle-cloud.ts`.
- Model names match the catalog exactly (`apps/server/src/routes/models.ts:202-204`) so the settings UI labels stay consistent.
- Idempotent — safe to call on every sign-in.

### 5.2 Backend — call it on the sign-in event
**File:** `apps/server/src/routes/auth.ts` (`POST /device/token`, after `setSession(...)`, ~line 53)

```ts
setSession({ ... });
applyFreestyleCloudDefaults();   // NEW — symmetric to invalidateSession()'s revert on sign-out
identifyCloudUser(user);
```

Placing it in the route (not inside `setSession`) keeps session persistence decoupled from model side-effects and guarantees it runs only on real sign-in, consistent with how the sign-out route calls `invalidateSession()`.

### 5.3 Frontend — reflect the switch in the settings UI after sign-in
The renderer learns model config via `loadData()` in `use-models.ts` and currently refetches only after its own mutations. After a backend-driven switch on sign-in, the settings page must refetch so Freestyle Transcribe shows as the active **voice default, cleanup LLM default, and the cleanup toggle on** (verify `loadData()` reloads the `llm_cleanup` setting alongside `configured`, so the cleanup switch reflects the new `'true'` value).

**File:** `apps/electron/src/renderer/src/pages/models/use-models.ts` — add an effect that calls `loadData()` when `cloudAuth.user` transitions to signed-in. (The hook already exposes `loadData`; thread in `useCloudAuth()` or accept the user as a prop and key the effect on it.)

- Onboarding already refetches/commits explicitly, so no change is strictly required there; verify no double-commit conflict with `commitFreestyleCloudDefault()` (both are idempotent `is_default:true` writes for the same row, so the result is consistent).
- The sidebar/profile sign-in (`cloud-profile.tsx`, `cloud-signin-modal.tsx`) sets `cloud.user`; the above effect covers those entry points too.

### 5.4 Analytics
Emit a distinct event when the auto-switch fires (server-side, next to the existing `capture(...)` calls), e.g. `capture("freestyle_default_applied_on_signin", { voice: true, cleanup: true })`, to distinguish the auto-switch bundle from explicit picks (`"model configured"`, `"onboarding_cloud_default_set"`).

## 6. Edge Cases & Alternatives

- **No local model / fresh install signs in:** `applyFreestyleCloudDefaults()` inserts the Freestyle row, so a default now exists (improvement over today's possible `voice: null`).
- **Session expiry:** `getSession()` auto-calls `invalidateSession()` → revert to local. Acceptable and already the behavior. Next sign-in re-applies Freestyle.
- **Sign-in during onboarding:** `commitFreestyleCloudDefault()` + `applyFreestyleCloudDefaults()` both target the same row with `is_default:true`; no conflict.
- **Alt-A (first-sign-in-only):** persist a `settings` flag when the user explicitly picks a non-Freestyle model while signed in, and gate `applyFreestyleCloudDefaults()` on `!flag`. More code + a new setting; only needed if product rejects the §4.1 recommendation.
- **Alt-B (put apply inside `setSession`):** rejected — couples persistence with side-effects and would misfire if a token-refresh-that-calls-`setSession` is added later.

## 7. Testing

Extend `apps/server/tests/cloud-auth.test.ts`:
1. Sign-in with no prior default → after apply, both `getDefaultModels().voice.provider` and `.llm.provider` === `'freestyle-cloud'`, and `settings.llm_cleanup === 'true'`.
2. Sign-in with an existing local voice default and cleanup off → voice **and** llm defaults become `freestyle-cloud` and cleanup turns on (B1, full bundle).
3. Signed in, then `POST /configured` a local voice (or a different llm) → that choice persists; no re-switch (B3), independently for voice and llm.
4. Sign-out → `revertFreestyleCloudDefaults()` flips voice back to the most recent local model and forces `llm_cleanup='false'` (regression guard).
5. Sign-out then sign-in again → back to the full Freestyle bundle (idempotency of apply).

## 8. Summary of Changes
| Area | File | Change |
|---|---|---|
| Backend logic | `apps/server/src/lib/freestyle-cloud-defaults.ts` | Add `applyFreestyleCloudDefaults()` |
| Backend route | `apps/server/src/routes/auth.ts` | Call it after `setSession()` on sign-in |
| Frontend | `apps/electron/src/renderer/src/pages/models/use-models.ts` | Refetch `loadData()` on sign-in |
| Analytics | `auth.ts` / defaults lib | `capture("freestyle_default_applied_on_signin")` |
| Tests | `apps/server/tests/cloud-auth.test.ts` | Cover B1/B3 + idempotency |