# UI recovery and schedule clarity

## Approved scope

Follow up on the seven opportunities identified after PR #708. Keep Freestyle's existing typography, warm surfaces and semantic colors. Use inline feedback where the action happened and preserve user input when a request fails. All screenshots use isolated fixtures.

## Implementation plan

1. Network: serialize writes per setting; distinguish unsaved, saving, saved and failed values; retry the current draft; keep the cache truthful and show initial read errors.
2. Billing: distinguish unknown membership from a verified Free plan; expose retry and preserve the last known membership when a refresh fails.
3. Plugins: separate unavailable data from a missing plugin; show pending/success/error for update, toggle and uninstall; disable conflicting operations and allow retry.
4. Inspector tasks: persist before acknowledging task changes, retain failed additions, report pending/error and retry; prevent overlapping whole-file writes and preserve drafts while switching tabs.
5. Permissions: treat restricted microphone access separately, explain system/admin restrictions, and explain waiting for OS Settings changes.
6. Notifications: expose the session manager's refresh action, show retry progress, and provide sign-in with feedback through the existing auth flow.
7. Schedules: keep natural-language timing prominent, put cron/timezone under Advanced timing, explain interpreter-driven schedules and show an estimated next occurrence for explicit cron. Validate the supported five-field syntax, timezone and five-minute minimum. The Cloud backend remains authoritative and does not expose a pre-save interpretation endpoint; never invent exact times for natural-language requests.

## Verification and evidence

- Write behavioral failure/retry tests in the browser harness, with Electron coverage for native permission distinctions where appropriate.
- Test cron preview boundaries, timezone/DST behavior, malformed input and backend-supported syntax. Reuse a maintained parser rather than creating a second custom scheduler.
- Capture before and after states at the same viewport; include pending, error and recovery states plus a narrow/light appearance check.
- Run focused tests, desktop typechecks, the relevant full unit/browser/Electron suites, Biome, Knip and build.
- Review the complete branch with a fresh reviewer, address actionable findings, then create one draft PR with screenshot embeds.

## Progress

- Base: main `5db6a33d`. Existing untracked local audio research is unrelated and remains untouched.
- All seven areas implemented. Both task surfaces share drafts and a persistence lock; network writes reuse the setting queue previously used by Tone. Plugin settings reads/reloads now check responses before reporting success.
- Verification: 476 Electron unit tests, all 43 browser scenarios (including 13 recovery scenarios), all 39 Electron dashboard scenarios, desktop main/renderer typechecks, Electron build, repository Biome and Knip passed. Knip reports two existing redundant-entry configuration hints.
- A fresh review found weekday normalization and repeated-hour DST differences between the preview library and Cloud. Regression tests reproduced both before the fixes; a scoped re-review closed both findings. A separate comparison against the owning Cloud implementation matched 168 schedule/timezone/date combinations. No Cloud code or deployment is required.
- Screenshot evidence lives in `assets/ui-recovery/`; before/after pairs and additional failure/timing/layout states use disposable browser fixtures. No live billing, provider credentials, or native permission changes were performed.
