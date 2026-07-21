# Submitting Freestyle to the app stores

Freestyle mobile is submitted via **EAS Build + EAS Submit** (cloud). This doc covers
the config that lives in the repo and the one-time / manual steps that do not.

- Bundle ID (iOS) / package (Android): `com.freestylevoice.app`
- iOS keyboard extension: `com.freestylevoice.app.keyboard` (App Group `group.com.freestylevoice.app`)
- EAS project: `freestyle-voice` org, projectId in `app.json` → `extra.eas.projectId`

## In-repo config

- `eas.json` → `build.production` (cloud build, `autoIncrement`, remote credentials)
- `eas.json` → `submit.production`:
  - iOS: `ascAppId` + `appleTeamId` — **replace the placeholders** before first submit.
  - Android: first release goes to the `internal` track as a `draft`.
- `.eas/workflows/submit-ios.yml` — build (production) → TestFlight, manual trigger.
- `.eas/workflows/submit-android.yml` — build (production) → Play submit, manual trigger.

## One-time credential setup (interactive, not in repo)

### iOS — App Store Connect API Key

```sh
eas credentials --platform ios
# → production profile
# → App Store Connect: Manage your API Key
# → Set up your project to use an API Key for EAS Submit
```

Then fill `eas.json` `submit.production.ios.ascAppId` (App Store Connect →
App Information → Apple ID) and `appleTeamId`.

Register both bundle IDs in the Apple Developer portal if not already present:
`com.freestylevoice.app` and `com.freestylevoice.app.keyboard`, each with the
App Group `group.com.freestylevoice.app` enabled.

For the `submit-ios.yml` workflow's `testflight` job, also configure the App Store
Connect connection in the Expo dashboard (Project settings → Connections).

### Android — Google Service Account key

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
eas build  --platform all --profile production
eas submit --platform ios      --profile production   # → TestFlight (~10–15 min processing)
eas submit --platform android  --profile production   # → Play internal track (draft)
```

Verify the iOS production build embeds and signs the `FreestyleKeyboard` extension.

## Finish in the consoles (manual — EAS Submit does not do these)

- **App Store Connect:** metadata, screenshots, privacy manifest / mic + keyboard
  usage declarations → select build → submit for App Review.
- **Play Console:** store listing, Data Safety form, content rating → promote
  `internal` → `production`.

## CI (EAS Workflows)

These workflows are **manual-trigger only** (`workflow_dispatch`) — this is a
monorepo, so an `on: push` trigger would build and submit the mobile app on every
unrelated merge to `main`. Run them explicitly:

```sh
eas workflow:run submit-ios.yml
eas workflow:run submit-android.yml
```

External CI/CD needs an `EXPO_TOKEN` secret.
