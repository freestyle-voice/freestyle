# Welcome and dictation setup

The approved direction is a compact welcome with two supported paths, followed
by model and permission checks and real practice. Retain Freestyle's serif and
green identity. Replace promotional cards with clear next steps. Cloud sign-in
opens the existing browser device flow; local models and provider keys require
no Freestyle account. Remix is introduced briefly as optional follow-on work.

Use the existing Models page inside setup rather than building another model
picker or sending a first-time user into the settings shell. Setup keeps a
visible return action. URL search parameters retain the selected setup path and
step on reload. Model availability and permissions determine practice readiness;
do not infer readiness from a hotkey press or call an animated sample a result.
Practice uses the existing interactive TutorialDemo and configured output mode.
Users may finish setup later, but incomplete setup must never be labeled ready.

Explicit completion waits for a successful local settings write. Failure keeps
the user in the flow with Retry; no optimistic completed cache entry. Existing
completed saves and established workspaces retain their migration behavior.
Settings read failures must offer retry rather than overwrite a saved record.

## Implementation plan

- [x] Capture baseline welcome at desktop dark/light and narrow dark.
- [x] Add persistence regressions for HTTP/network failures, confirmed success,
  rapid retries and preservation of existing completion records.
- [x] Replace welcome with Cloud and local/API-key choices. Handle browser
  waiting, cancellation and retry through the existing auth provider and modal.
- [x] Add setup checklist, integrated Models page and permission checks with
  explicit actions, errors and refresh after returning from system settings.
- [x] Add real practice after prerequisites, respecting shortcut and output mode.
  Keep finish-later available and completion retryable.
- [x] Cover guest, signed-in, missing/invalid models, read/write failures,
  restricted microphone, clipboard output and narrow layout in browser tests.
- [x] Update existing Electron onboarding scenarios for the new flow, run focused
  regressions, typechecks and full suites; inspect screenshots and branch diff.
- PR delivery includes uploaded before/after images and new flow states.

## Review focus

Cloud sign-in can finish after cancellation; changing path must not be undone
by the stale result. A configured model can have a missing key or missing local
download. Permissions can be denied, restricted or unavailable; never request
microphone capture on welcome mount. Saving completion can fail or be slow;
do not navigate or write duplicates before acknowledgment. Setup must remain
usable without an account, without Cloud history and at narrow/short viewports.


## Validation and visual evidence

- 480 Electron unit tests and 58 browser scenarios (13 setup scenarios) passed.
- 39 native dashboard scenarios passed, including guest and signed-in setup.
- All 12 native startup scenarios passed on retry after one shutdown timeout.
- Electron build/typechecks, repository Biome and Knip passed. Knip retains its
  two existing redundant-entry configuration hints.
- Independent read-only review closed Linux permission refresh and missing-key
  inventory findings with focused browser regressions. No remaining findings.

Before images use base revision `9bc84022` in an isolated source snapshot; after
images use this branch's actual renderer. Desktop comparisons use 1200 × 900
viewports, narrow comparisons use 640 × 1100. Identical bottom crops remove the
browser development toolbar. New setup states are framed around their full
content. All comparisons have visible pixel differences. Screenshots use local
fixture accounts, provider metadata and permission responses; they do not change
system permissions or invoke a live transcription provider. Practice input is
empty rather than displaying a simulated successful transcript.

Images are uploaded directly to GitHub from local captures, not committed as
repository assets. Regenerate after screenshots with
`FREESTYLE_SETUP_SCREENSHOTS=/tmp/freestyle-welcome-shots pnpm --filter @freestyle-voice/electron test:browser`.
