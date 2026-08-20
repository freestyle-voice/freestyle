# Submitting Freestyle to the app stores

Freestyle mobile is submitted via **EAS Build + EAS Submit** (cloud). This doc covers
the config that lives in the repo and the one-time / manual steps that do not.

- Bundle ID (iOS) / package (Android): `com.freestylevoice.app`
- iOS keyboard extension: `com.freestylevoice.app.keyboard` (App Group `group.com.freestylevoice.app`)
- EAS project: `freestyle-voice` org, projectId in `app.json` → `extra.eas.projectId`

> **Status:** iOS first. Android is deferred — the Android submit workflow and
> credentials setup will be added later.

## In-repo config

- `eas.json` → `build.production` (cloud build, `autoIncrement`, remote credentials)
- `eas.json` → `submit.production`:
  - iOS: `ascAppId` (`6793253767`) + `appleTeamId` (`X87V5R2F7D`) — set.
  - Android: first release goes to the `internal` track as a `draft` (deferred).
- `.eas/workflows/submit-ios.yml` — build (production) → TestFlight, manual trigger.

## One-time credential setup (interactive, not in repo)

### iOS — App Store Connect API Key

```sh
eas credentials --platform ios
# → production profile
# → App Store Connect: Manage your API Key
# → Set up your project to use an API Key for EAS Submit
```

Then fill `eas.json` `submit.production.ios.ascAppId` (App Store Connect →
App Information → Apple ID) and `appleTeamId` — done: `6793253767` / `X87V5R2F7D`.

Register both bundle IDs in the Apple Developer portal if not already present:
`com.freestylevoice.app` and `com.freestylevoice.app.keyboard`, each with the
App Group `group.com.freestylevoice.app` enabled.

For the `submit-ios.yml` workflow's `testflight` job, also configure the App Store
Connect connection in the Expo dashboard (Project settings → Connections).

### Android — Google Service Account key (deferred)

Android submission is not set up yet. When picking it back up:

1. Create a key: https://expo.fyi/creating-google-service-account
2. Grant it release permissions in Google Play Console.
3. Upload to EAS:

```sh
eas credentials --platform android
# → production → Google Service Account → Upload a Google Service Account Key
```

The app record for `com.freestylevoice.app` must already exist in Play Console.

## Build + submit (CLI)

```sh
cd apps/mobile
eas build  --platform ios --profile production
eas submit --platform ios --profile production   # → TestFlight (~10–15 min processing)
```

Verify the iOS production build embeds and signs the `FreestyleKeyboard` extension.

## Finish in the consoles (manual — EAS Submit does not do these)

- **App Store Connect:** metadata, screenshots, privacy manifest / mic + keyboard
  usage declarations → select build → submit for App Review.

## In-App Purchases (Freestyle Pro subscription)

Mobile Pro uses **native In-App Purchase** (`expo-iap`, StoreKit 2 / Play Billing),
not the desktop's web Stripe checkout — Apple mandates IAP for digital
subscriptions. The product IDs default to (overridable via `extra.iap` or
`EXPO_PUBLIC_IAP_PRO_MONTHLY` / `EXPO_PUBLIC_IAP_PRO_YEARLY` — see
`src/lib/cloud/config.ts`):

- `com.freestylevoice.app.pro.monthly`
- `com.freestylevoice.app.pro.yearly`

### App Store Connect (one-time)

1. Sign the **Paid Apps agreement** (App Store Connect → Business) — IAP won't
   load until this is active.
2. Create an **auto-renewable subscription group** (e.g. "Freestyle Pro") with
   the two product IDs above; set prices and localizations.
3. Create a **sandbox tester** (Users and Access → Sandbox) to test purchases
   in a dev/TestFlight build. IAP does **not** work in Expo Go — use a dev
   client or TestFlight build.
4. For production review, attach the subscription products to the app version.

### Google Play (deferred, with Android)

Create the same product IDs as subscriptions in Play Console → Monetize →
Subscriptions, and add the license-testing account.

### Backend (separate cloud repo — `service.freestylevoice.com`)

The client never trusts a local purchase; it forwards the signed transaction to
the cloud for validation and entitlement grant. The cloud must implement:

- `POST /v1/iap/verify` — validate the StoreKit 2 JWS (Apple App Store Server
  API) / Play purchase token (Google Play Developer API), then set the account's
  `unlimited` entitlement. Contract documented in `src/lib/cloud/iap-verify.ts`.
- **Store server notifications** — App Store Server Notifications v2 and Google
  RTDN webhooks to keep `unlimited` in sync on renewal, cancel, refund, and
  billing retry.

Until `/v1/iap/verify` is deployed, the client treats a 404/501 as "purchases
not available yet" and does not grant Pro (the receipt is preserved by StoreKit
and can be restored once the endpoint ships).

## CI (EAS Workflows)

The iOS workflow is **manual-trigger only** (`workflow_dispatch`) — this is a
monorepo, so an `on: push` trigger would build and submit the app on every
unrelated merge to `main`. Run it explicitly:

```sh
eas workflow:run submit-ios.yml
```

External CI/CD needs an `EXPO_TOKEN` secret.
