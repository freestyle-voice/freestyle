# Focus Freestyle on voice dictation

Date: 2026-11-10
Base: `origin/main` at `f997c012` (first-dictation onboarding, #712).

## Intent and scope

Remove the Remix conversational agent across this repository: Electron,
mobile, the embedded server, shared contracts, and published product docs.
The user chose removal across this repo over a desktop-only first step.
Freestyle should open into voice dictation and expose only capabilities that
support that workflow.

## Approaches

1. Hide Remix entry points. Smaller change, but leaves agent services, native
   listeners, dependencies, and maintenance costs in the application.
2. Remove desktop Remix first. Easier to review in isolation, but leaves two
   different product directions across desktop and mobile.
3. Remove the feature across this repo. Chosen by the user. Remove dedicated
   agent code and integrations, and simplify shared code around dictation.

The separate `cloud` repository and production deployment are outside this PR.
Its compatibility endpoints remain available to older desktop/mobile releases.

## Resulting experience

- Desktop starts at `/today`, with a single Dictate navigation. Remove the
  workspace switcher, Remix sessions, chat search, capabilities, schedules,
  connected apps, and agent-specific notification navigation.
- The recording pill supports dictation and its existing errors/cancellation
  behavior. Remove the Remix hotkey, chat expansion, tools, file approvals,
  document-editing IPC, and agent listener/focus lifecycle.
- Mobile home is the existing dictation experience with microphone,
  transcript, copy/share/clear, history, settings, and keyboard setup. Remove
  chat mode, session sidebar, agent-thread pages, agent approvals, connected
  apps, automations, and agent notification links.
- Model settings retain speech models and transcript-cleanup models. Remove
  Remix model selection and runtime/status UI.
- Product docs describe dictation; remove Remix/MCP features and navigation.

## Preserve

Keep microphone capture, native global dictation hotkeys, streaming and batch
transcription, paste/clipboard output, keyboard dictation extensions, cleanup,
tones/formats, translation, history, vocabulary/dictionary, authentication,
billing/usage required by dictation, local/BYOK models, plugins used by dictation,
and onboarding from the current main commit.

Do not remove APIs or dependencies simply because their names contain
`agent` or `AI`. AI model providers remain necessary for transcript cleanup.
The mobile resident keyboard bridge currently mixes dictation and Remix:
remove its agent turns, clarification parser (`voice-agent.ts`), mode selector,
and auto-listen-after-question preference, while retaining its audio session,
insertion handshake, background capture, cancellation, and recovery behavior.
Update the source Swift keyboard extension and shared-store bridge together;
ignore legacy stored Remix mode and resolve it to dictation.

## Server and shared code

Remove mounted Remix/agent run, thread, queue, local machine tool, MCP,
agent-memory, schedule, connector, and agent-output routes when exclusive to
Remix. Trace all imports/startup hooks before deleting their implementations.
Keep `/api/output`: it runs the dictation `beforeOutput` plugin pipeline.
Remove agent-only validation exports and packages only after their remaining
consumers are gone. Retain notification/account primitives needed by billing,
updates, or transcription failures; remove agent-specific producers and links.

Existing local database migrations and user data must remain readable. Do not
drop agent tables, delete stored conversations, revoke connected accounts, or
clear application storage in this PR. Stop runtime activity associated with the
removed feature, including queue drainers, subscriptions, and native listeners.
This stops client/local runtime activity. Existing schedules owned by the cloud
service remain unchanged; this PR does not cancel remote tasks or accounts.
Historical engineering specs remain as the investigation record.

Old workspace preferences must not route into a removed screen. Redirect
legacy desktop `/remix` links to `/today`; give old mobile agent links a safe
dictation destination without mounting an agent client.

## Implementation boundaries

Use the existing React/Electron and Expo architecture. This is removal and
simplification, not a visual redesign. Preserve dictation's native key handling,
focus restoration, recording lifecycle, and overlay entry/exit behavior.
Read the pinned Expo SDK 57 documentation before changing mobile code.

Update relevant browser fixtures, locales, tests, package manifests, lockfile,
and product descriptions as their agent consumers disappear. Keep unrelated
local research (`specs/local-audio-workspace-research.md`) out of the PR.

## Validation

- Run the affected packages' typechecks and meaningful existing tests.
- Verify both desktop and mobile have reachable dictation home/settings/history
  flows and no mounted Remix routes, transports, native hotkeys, or queue loops.
- Verify desktop startup ignores old Remix workspace selection, and old links
  resolve safely.
- Build the embedded server and desktop/browser bundles; check the agent-only
  modules and dependencies are absent from active import graphs.
- Exercise browser dictation navigation/onboarding fixtures where supported.
  Report physical microphone, native hotkey, and iOS keyboard checks separately
  if they cannot be performed in this environment.

## Approval

The user approved this design and instructed implementation and PR creation
on 2026-11-10.
